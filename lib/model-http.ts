import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { Agent, fetch as undiciFetch } from 'undici'
import { fetchWithLimits } from './bounded-io.ts'

export function isPublicModelAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && c <= 2))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
  }
  if (family === 6) {
    const value = address.toLowerCase()
    const second = Number.parseInt(value.split(':')[1] || '0', 16)
    return /^[23]/.test(value) && !(value.startsWith('2001:') && (second < 0x200 || second === 0xdb8)) && !value.startsWith('2002:')
  }
  return false
}

type ResolvedAddress = { address: string; family: number }
type Resolver = (host: string) => Promise<ResolvedAddress[]>

/** Resolve once and pin the approved addresses into the actual TCP lookup, preventing DNS rebinding. */
export async function createModelDispatcher(url: URL, resolve: Resolver = host => lookup(host, { all: true, verbatim: true })): Promise<Agent> {
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '')
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Invalid model endpoint URL')
  const allowed = (process.env.AI_ALLOWED_HOSTS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean).includes(host)
  if (url.protocol !== 'https:' && !allowed) throw new Error('Model endpoints require HTTPS; explicitly allow local hosts for self-hosted models')
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await resolve(host)
  if (!addresses.length || addresses.some(entry => !isIP(entry.address) || (!allowed && !isPublicModelAddress(entry.address)))) throw new Error('Private or reserved model endpoint addresses are not allowed')
  return new Agent({ connect: { lookup: (_host, options, callback) => {
    if (options?.all) callback(null, addresses)
    else callback(null, addresses[0].address, addresses[0].family)
  } } })
}

export async function fetchModelURL(input: string, init: RequestInit, options: { maxBytes?: number; timeoutMs?: number } = {}, resolve?: Resolver): Promise<Response> {
  const dispatcher = await createModelDispatcher(new URL(input), resolve)
  return fetchWithLimits(input, init, {
    ...options,
    onDone: () => { void dispatcher.close().catch(() => {}) },
    fetcher: async (target, request) => {
      if (request.body != null && typeof request.body !== 'string') throw new Error('Model requests must use a JSON text body')
      // Undici 8 dispatchers use a new handler contract; use its matching fetch implementation.
      const upstream = await undiciFetch(target, {
        method: request.method, body: request.body, signal: request.signal,
        headers: Object.fromEntries(new Headers(request.headers)), redirect: 'error', dispatcher,
      })
      // Node's stream/web and DOM declarations differ, but share the same WHATWG stream implementation.
      return new Response(upstream.body as unknown as ReadableStream<Uint8Array> | null, { status: upstream.status, statusText: upstream.statusText, headers: [...upstream.headers] })
    },
  })
}
