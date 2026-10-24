import { validateInputComplexity } from './bounded-io.ts'

export function toChatProtocol(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const encoder = new TextEncoder()
  let buffer = ''
  let finished = false
  const finish = (controller: TransformStreamDefaultController<Uint8Array>) => {
    if (!finished) { finished = true; controller.enqueue(encoder.encode('d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n')) }
  }
  const processLine = (line: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!data) return
    if (data === '[DONE]') { finish(controller); controller.terminate(); return }
    const parsed = JSON.parse(data)
    validateInputComplexity(parsed)
    const content: unknown = parsed.choices?.[0]?.delta?.content
    if (content != null) {
      if (typeof content !== 'string') throw new Error('Invalid model stream content')
      if (content) controller.enqueue(encoder.encode(`0:${JSON.stringify(content)}\n`))
    }
  }
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      let end: number
      while (!finished && (end = buffer.indexOf('\n')) >= 0) {
        if (end > 256 * 1024) throw new Error('Model stream event exceeds safety limit')
        processLine(buffer.slice(0, end).replace(/\r$/, ''), controller)
        buffer = buffer.slice(end + 1)
      }
      if (buffer.length > 256 * 1024) throw new Error('Model stream event exceeds safety limit')
    },
    flush(controller) {
      buffer += decoder.decode()
      if (buffer && !finished) processLine(buffer.replace(/\r$/, ''), controller)
      finish(controller)
    },
  }))
}
