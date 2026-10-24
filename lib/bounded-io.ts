export const IO_LIMITS = {
  jsonBytes: 2 * 1024 * 1024,
  streamBytes: 16 * 1024 * 1024,
  frameChars: 256 * 1024,
  timeoutMs: 120_000,
} as const

export class InputLimitError extends Error {
  constructor(message = 'Input exceeds safety limits') { super(message); this.name = 'InputLimitError' }
}

export function validateInputComplexity(value: unknown): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }]
  let nodes = 0
  while (stack.length) {
    const item = stack.pop()!
    if (++nodes > 20_000 || item.depth > 24) throw new InputLimitError()
    if (item.value && typeof item.value === 'object') {
      const entries = Object.entries(item.value)
      if (entries.length > 1000) throw new InputLimitError('Collection is too large')
      for (const [key, child] of entries) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new InputLimitError('Unsafe object key')
        stack.push({ value: child, depth: item.depth + 1 })
      }
    }
  }
}

export async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  let bytes = 0
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) throw new InputLimitError('Response body exceeds maximum size')
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function readLimitedJSON(response: Response, maxBytes = IO_LIMITS.jsonBytes): Promise<any> {
  const value = JSON.parse(await readLimitedText(response, maxBytes))
  validateInputComplexity(value)
  return value
}

/** Count binary uploads without trying to decode JPEG/PNG data as UTF-8. */
export async function discardLimitedBody(response: Response, maxBytes: number): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) return
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      bytes += value.byteLength
      if (bytes > maxBytes) throw new InputLimitError()
    }
  } finally {
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/** Count actual decoded bytes, keep timeout active through body consumption, and cancel upstream on every exit. */
export async function fetchWithLimits(input: string | URL, init: RequestInit = {}, options: { maxBytes?: number; timeoutMs?: number; onDone?: () => void; fetcher?: (input: string | URL, init: RequestInit) => Promise<Response> } = {}): Promise<Response> {
  const controller = new AbortController()
  const abort = () => controller.abort(init.signal?.reason)
  if (init.signal?.aborted) abort()
  init.signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(new Error('Response timeout')), options.timeoutMs ?? IO_LIMITS.timeoutMs)
  let cleaned = false
  const cleanup = () => { if (cleaned) return; cleaned = true; clearTimeout(timer); init.signal?.removeEventListener('abort', abort); options.onDone?.() }
  try {
    const response = await (options.fetcher ?? fetch)(input, { ...init, signal: controller.signal, redirect: 'error' })
    const reader = response.body?.getReader()
    if (!reader) { cleanup(); return response }
    const maxBytes = options.maxBytes ?? IO_LIMITS.jsonBytes
    const advertised = response.headers.get('content-length')
    if (advertised && /^\d+$/.test(advertised) && Number(advertised) > maxBytes) {
      void reader.cancel().catch(() => {})
      throw new InputLimitError('Response body exceeds maximum size')
    }
    let bytes = 0
    const body = new ReadableStream<Uint8Array>({
      async pull(destination) {
        try {
          const { done, value } = await reader.read()
          if (done) { cleanup(); destination.close(); return }
          bytes += value.byteLength
          if (bytes > maxBytes) throw new InputLimitError('Response body exceeds maximum size')
          destination.enqueue(value)
        } catch (error) {
          cleanup()
          void reader.cancel().catch(() => {})
          destination.error(error)
        }
      },
      async cancel(reason) { cleanup(); controller.abort(reason); await reader.cancel(reason).catch(() => {}) },
    })
    const headers = new Headers(response.headers)
    for (const name of ['content-length', 'content-encoding', 'transfer-encoding']) headers.delete(name)
    return new Response(body, { status: response.status, statusText: response.statusText, headers })
  } catch (error) { cleanup(); controller.abort(); throw error }
}
