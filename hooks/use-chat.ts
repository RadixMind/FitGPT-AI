'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { consumeChatStream, type ChatMessage } from '@/lib/chat-stream'
import { fetchWithLimits, IO_LIMITS, readLimitedJSON } from '@/lib/bounded-io'

interface ChatOptions {
  api: string
  initialMessages?: ChatMessage[]
  initialInput?: string
  headers?: Record<string, string>
  body?: Record<string, unknown>
  onResponse?: (response: Response) => void | Promise<void>
  onError?: (error: Error) => void
  onFinish?: (message: ChatMessage) => void
}

export function useChat(options: ChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(options.initialMessages ?? [])
  const [input, setInput] = useState(options.initialInput ?? '')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const pending = useRef<AbortController | null>(null)
  const latest = useRef({ options, messages, input })
  latest.current = { options, messages, input }
  useEffect(() => () => pending.current?.abort(), [])
  const handleInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => setInput(event.target.value), [])
  const handleSubmit = useCallback(async (event?: FormEvent) => {
    event?.preventDefault()
    const { options: current, messages: previous, input: text } = latest.current
    if (!text.trim() || pending.current) return
    const controller = new AbortController()
    pending.current = controller
    const outgoing: ChatMessage[] = [...previous, { id: crypto.randomUUID(), role: 'user', content: text }]
    const reply: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '' }
    setMessages(outgoing)
    setInput('')
    setError(null)
    setIsLoading(true)
    try {
      const response = await fetchWithLimits(current.api, {
        method: 'POST', signal: controller.signal,
        headers: { ...current.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...current.body, messages: outgoing }),
      }, { maxBytes: IO_LIMITS.streamBytes })
      await current.onResponse?.(response)
      if (!response.ok) {
        const data = await readLimitedJSON(response).catch(() => ({}))
        throw new Error(data.error || `Chat request failed (${response.status})`)
      }
      setMessages([...outgoing, reply])
      await consumeChatStream(response, chunk => {
        reply.content += chunk
        setMessages([...outgoing, { ...reply }])
      })
      current.onFinish?.(reply)
    } catch (cause) {
      if (!controller.signal.aborted) {
        const failure = cause instanceof Error ? cause : new Error('Chat failed')
        setError(failure)
        current.onError?.(failure)
      }
    } finally { pending.current = null; setIsLoading(false) }
  }, [])
  return { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages, setInput }
}
