import { NextRequest, NextResponse } from 'next/server'
import { getAggregateLoginURL } from '@/lib/aggregate-login-url'
import { fetchWithLimits, readLimitedJSON } from '@/lib/bounded-io'

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type')
    if (!type || !['qq', 'wx', 'wxmp', 'alipay'].includes(type)) return NextResponse.json({ error: 'Invalid login type' }, { status: 400 })
    const appid = process.env.AGGREGATE_LOGIN_APPID
    const appkey = process.env.AGGREGATE_LOGIN_APPKEY
    if (!appid || !appkey || !process.env.NEXTAUTH_URL) return NextResponse.json({ error: 'Aggregate login not configured' }, { status: 503 })
    const state = crypto.randomUUID()
    const redirect = new URL('/api/auth/aggregate-login/callback', process.env.NEXTAUTH_URL)
    redirect.searchParams.set('state', state)
    const target = new URL(getAggregateLoginURL())
    target.search = new URLSearchParams({ act: 'login', appid, appkey, type, redirect_uri: redirect.toString() }).toString()
    const upstream = await fetchWithLimits(target, {}, { timeoutMs: 15_000, maxBytes: 64 * 1024 })
    if (!upstream.ok) { await upstream.body?.cancel(); throw new Error('Login provider unavailable') }
    const data = await readLimitedJSON(upstream, 64 * 1024)
    if (data.code !== 0 || typeof data.url !== 'string') throw new Error('Invalid login provider response')
    const destination = new URL(data.url)
    if (!['https:', 'http:'].includes(destination.protocol) || destination.username || destination.password) throw new Error('Invalid login URL')
    if (destination.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(destination.hostname)) throw new Error('HTTPS login required')
    const response = NextResponse.json({ success: true, url: destination.toString(), type })
    response.cookies.set('fitgpt-login-state', state, { httpOnly: true, sameSite: 'lax', secure: new URL(process.env.NEXTAUTH_URL).protocol === 'https:', path: '/api/auth/aggregate-login', maxAge: 300 })
    return response
  } catch {
    return NextResponse.json({ error: 'Failed to get authorization URL' }, { status: 502 })
  }
}
