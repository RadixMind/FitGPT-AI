export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'data'
  content: string
  images?: string[]
  createdAt?: Date
}

/** The existing HTTP contract: newline-delimited 0:JSON text, 3:JSON errors and d:JSON completion. */
export async function consumeChatStream(response: Response, onText: (text: string) => void): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Empty chat response')
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let buffer = ''
  let bytes = 0
  const line = (value: string) => {
    if (!value.trim()) return
    const separator = value.indexOf(':')
    if (separator < 1) throw new Error('Invalid chat stream frame')
    const type = value.slice(0, separator)
    if (!['0', '3', 'd', 'e'].includes(type)) return
    const payload: unknown = JSON.parse(value.slice(separator + 1))
    if (type === '3') throw new Error(typeof payload === 'string' ? payload : 'Chat failed')
    if (type === '0') {
      if (typeof payload !== 'string') throw new Error('Invalid chat text frame')
      onText(payload)
    }
  }
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > 16 * 1024 * 1024) throw new Error('Chat response is too large')
      buffer += decoder.decode(next.value, { stream: true })
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) {
        if (end > 256 * 1024) throw new Error('Chat frame is too large')
        line(buffer.slice(0, end))
        buffer = buffer.slice(end + 1)
      }
      if (buffer.length > 256 * 1024) throw new Error('Chat frame is too large')
    }
    buffer += decoder.decode()
    if (buffer) line(buffer)
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock() }
}
