import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import net from 'node:net'
import { startLocalServices, TEST_USER_ID, TEST_MODEL_KEY, TEST_MODEL, TEST_REPLY } from '../tests/fixtures/local-services.mjs'
import { consumeChatStream } from '../lib/chat-stream.ts'

process.env.KEY_ENCRYPTION_SECRET = 'local-integration-encryption-secret-0123456789abcdef'
await mkdir('work', { recursive: true })
const fixtures = await startLocalServices()
const probe = net.createServer().listen(0, '127.0.0.1'); await once(probe, 'listening')
const port = probe.address().port; await new Promise(resolve => probe.close(resolve))
const origin = `http://127.0.0.1:${port}`
const log = createWriteStream('work/local-integration-server.log')
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
  env: {
    ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NEXTAUTH_URL: origin, AUTH_URL: origin, AUTH_TRUST_HOST: 'true',
    NEXTAUTH_SECRET: 'local-integration-auth-secret-0123456789abcdef', AUTH_SECRET: 'local-integration-auth-secret-0123456789abcdef',
    NEXT_PUBLIC_SUPABASE_URL: fixtures.origin, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-anon-fixture', SUPABASE_SERVICE_ROLE_KEY: 'local-service-role-fixture',
    AGGREGATE_LOGIN_API_URL: `${fixtures.origin}/aggregate`, AGGREGATE_LOGIN_APPID: 'local-test-app', AGGREGATE_LOGIN_APPKEY: 'local-test-provider-key',
    DB_PROVIDER: 'supabase', DATABASE_URL: '', DEFAULT_OPENAI_API_KEY: TEST_MODEL_KEY, DEFAULT_OPENAI_BASE_URL: fixtures.origin, AI_ALLOWED_HOSTS: '127.0.0.1',
    CRON_SECRET: 'local-integration-cron-secret-0123456789abcdef',
  }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
})
server.stdout.pipe(log); server.stderr.pipe(log)
const results = []
const jar = new Map()
function cookies(response, target = jar) {
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(';'); const index = pair.indexOf('=')
    if (index >= 0) { const name = pair.slice(0, index), value = pair.slice(index + 1); if (value) target.set(name, value); else target.delete(name) }
  }
}
async function request(path, init = {}, target = jar) {
  const response = await fetch(origin + path, { ...init, redirect: 'manual', headers: { ...init.headers, cookie: [...target].map(([name, value]) => `${name}=${value}`).join('; ') }, signal: AbortSignal.timeout(30_000) })
  cookies(response, target); return response
}
const json = (body, headers = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
async function check(name, action) { await action(); results.push({ name, passed: true }); console.log(`PASS ${name}`) }

try {
  let ready = false
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error(`Local Next.js exited with ${server.exitCode}; see work/local-integration-server.log`)
    try { const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2000) }); ready = response.ok; if (ready) break } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.ok(ready, 'Local production server did not start')
  await check('health reaches the local database fixture', async () => {
    const data = await (await request('/api/health')).json(); assert.equal(data.services.supabase.connected, true)
  })
  await check('unsigned credentials cannot create a session', async () => {
    const unsigned = new Map()
    const { csrfToken } = await (await request('/api/auth/csrf', {}, unsigned)).json()
    const response = await request('/api/auth/callback/credentials', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken, userId: TEST_USER_ID, providerUserId: 'qq_local-test', callbackUrl: origin }).toString() }, unsigned)
    await response.body?.cancel()
    const session = await (await request('/api/auth/session', {}, unsigned)).json(); assert.ok(!session?.user)
  })
  await check('unauthenticated model calls, cron and production debug endpoints are blocked', async () => {
    assert.equal((await request('/api/models', json({ baseUrl: fixtures.origin, apiKey: TEST_MODEL_KEY }))).status, 401)
    assert.equal((await request('/api/diagnose', json({ baseUrl: fixtures.origin }))).status, 401)
    assert.equal((await request('/api/test-model', json({ modelConfig: { name: TEST_MODEL, baseUrl: fixtures.origin, apiKey: TEST_MODEL_KEY } }))).status, 401)
    assert.equal((await request('/api/cron/update-models')).status, 401)
    assert.equal((await request('/api/debug/vercel-env')).status, 404)
    assert.equal((await request('/api/auth/aggregate-login/callback?type=qq&code=local-valid-code')).status, 400)
    const config = await (await request('/api/auth/aggregate-login/config')).text()
    assert.ok(!config.includes('appkey') && !config.includes('local-test-provider-key'))
    assert.equal((await request('/api/auth/aggregate-login/userinfo', { headers: { authorization: 'Bearer temp_qq_forged_123' } })).status, 401)
  })
  await check('real login callback exchanges a local provider code and issues a NextAuth session', async () => {
    const authorization = await (await request('/api/auth/aggregate-login/authorize?type=qq')).json(); assert.equal(authorization.success, true)
    const simulatedProvider = await fetch(authorization.url, { redirect: 'manual' })
    const callback = new URL(simulatedProvider.headers.get('location'))
    const response = await request(callback.pathname + callback.search)
    assert.ok([302, 303, 307].includes(response.status))
    assert.equal(new URL(response.headers.get('location')).pathname, '/zh')
    const session = await (await request('/api/auth/session')).json(); assert.equal(session.user.id, TEST_USER_ID); assert.equal(session.user.trustLevel, 4)
  })
  await check('private model listing and non-streaming completions use the local model', async () => {
    const models = await (await request('/api/models', json({ baseUrl: fixtures.origin, apiKey: TEST_MODEL_KEY }))).json(); assert.equal(models.models[0].id, TEST_MODEL)
    const response = await request('/api/test-model', json({ modelType: 'chatModel', modelConfig: { name: TEST_MODEL, baseUrl: fixtures.origin, apiKey: TEST_MODEL_KEY } }))
    assert.equal(response.status, 200); const data = await response.json(); assert.equal(data.success, true)
    const diagnostic = await (await request('/api/diagnose', json({ baseUrl: fixtures.origin, apiKey: TEST_MODEL_KEY }))).json()
    assert.equal(diagnostic.tests.connection.success, true); assert.equal(diagnostic.tests.apiResponse.modelCount, 1)
  })
  for (const source of ['private', 'shared']) {
    await check(`${source} chat preserves UTF-8 and escaped streamed model output`, async () => {
      const config = { chatModel: { source, name: TEST_MODEL, baseUrl: fixtures.origin, apiKey: TEST_MODEL_KEY, sharedKeyConfig: { selectedModel: TEST_MODEL, selectedKeyIds: [fixtures.tables.shared_keys[0].id] } } }
      const response = await request('/api/openai/chat', json({ messages: [{ role: 'user', content: '本地测试' }], aiConfig: config }, { 'x-ai-config': JSON.stringify(config), 'x-expert-role': 'general' }))
      assert.equal(response.status, 200, await response.clone().text())
      let content = ''; await consumeChatStream(response, chunk => content += chunk)
      assert.equal(content, TEST_REPLY)
    })
    await check(`${source} food, exercise and binary image parsing preserve structured results`, async () => {
      const modelConfig = { source, name: TEST_MODEL, baseUrl: fixtures.origin, apiKey: TEST_MODEL_KEY, sharedKeyConfig: { selectedModel: TEST_MODEL } }
      const aiConfig = { agentModel: modelConfig, chatModel: modelConfig, visionModel: modelConfig }
      for (const type of ['food', 'exercise']) {
        const response = await request('/api/openai/parse-shared', json({ text: type === 'food' ? '一个鸡蛋' : '跑步30分钟', type, userWeight: 70, aiConfig }))
        assert.equal(response.status, 200, await response.clone().text())
        const parsed = await response.json(); assert.equal(parsed[type].length, 1)
        assert.match(parsed[type][0].log_id, /^[0-9a-f-]{36}$/)
      }
      const form = new FormData(); form.set('text', '本地图片测试'); form.set('type', 'food'); form.set('userWeight', '70'); form.set('aiConfig', JSON.stringify(aiConfig))
      form.set('image0', new Blob([await readFile('public/FitGPT.png')], { type: 'image/png' }), 'local-fixture.png')
      const imageResponse = await request('/api/openai/parse-with-images', { method: 'POST', body: form })
      assert.equal(imageResponse.status, 200, await imageResponse.clone().text())
      assert.equal((await imageResponse.json()).food[0].food_name, '本地测试鸡蛋')
    })
  }
  await check('oversized collections and private network probes are rejected', async () => {
    assert.equal((await request('/api/models', json({ values: Array(1001).fill(0) }))).status, 413)
    const response = await request('/api/models', json({ baseUrl: 'http://169.254.169.254', apiKey: TEST_MODEL_KEY })); assert.equal(response.status, 500)
    const diagnostic = await (await request('/api/diagnose', json({ baseUrl: 'http://169.254.169.254' }))).json(); assert.equal(diagnostic.tests.connection.success, false)
    assert.equal(fixtures.counts.models >= 1, true)
  })
  await check('authorized cron refreshes the local shared model without exposing secrets', async () => {
    const response = await request('/api/cron/update-models', { headers: { authorization: 'Bearer local-integration-cron-secret-0123456789abcdef' } })
    const text = await response.text(); assert.ok([200, 207].includes(response.status), text); assert.ok(!text.includes(TEST_MODEL_KEY))
  })
  await check('authenticated application pages render after dependency migration', async () => {
    for (const path of ['/zh', '/zh/chat', '/zh/summary', '/zh/settings']) {
      const response = await request(path); assert.equal(response.status, 200, path); const html = await response.text(); assert.match(html, /FitGPT/); assert.doesNotMatch(html, /Internal Server Error/)
    }
  })
  const report = { passed: true, checks: results, services: fixtures.counts, database: 'local in-memory PostgREST-compatible fixture', model: 'local deterministic OpenAI-compatible fixture; no real inference weights or external accounts' }
  await writeFile('work/local-integration-results.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (process.argv.includes('--keep-open')) {
    await writeFile('work/local-browser-session.json', JSON.stringify({ origin, fixtureOrigin: fixtures.origin, model: TEST_MODEL, modelKey: TEST_MODEL_KEY }, null, 2))
    console.log(`Browser test server: ${origin}`)
    await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve) })
  }
} catch (error) {
  await writeFile('work/local-integration-results.json', JSON.stringify({ passed: false, checks: results, failure: error.message }, null, 2))
  throw error
} finally {
  server.kill('SIGTERM')
  await Promise.race([once(server, 'exit').catch(() => {}), new Promise(resolve => setTimeout(resolve, 5000))])
  if (server.exitCode === null) server.kill('SIGKILL')
  await fixtures.close(); log.end()
}
