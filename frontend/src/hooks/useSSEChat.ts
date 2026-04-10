import { useCallback, useRef, useState } from 'react'
import { Source } from '../api/chat'

export interface ChatMessage {
  id?: number      // database ID
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  streaming?: boolean
  sentAt?: string   // ISO timestamp
}

interface Options { onSessionCreated?: (sessionId: number) => void }

export function useSSEChat(options: Options = {}) {
  const [messages, setMessages]   = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (
    content: string,
    sessionId: number | null = null,
    documentIds: number[] | null = null,
    webSearch = false,
  ) => {
    if (streaming) return
    const now = new Date().toISOString()
    setMessages(prev => [
      ...prev,
      { role: 'user', content, sentAt: now },
      { role: 'assistant', content: '', streaming: true, sentAt: now },
    ])
    setStreaming(true)
    setError(null)
    abortRef.current = new AbortController()
    const token = localStorage.getItem('talk2doc_token')

    try {
      const res = await fetch('/api/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: content, session_id: sessionId, document_ids: documentIds, web_search: webSearch }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let pendingSources: Source[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (!payload) continue
          let event: Record<string, unknown>
          try { event = JSON.parse(payload) } catch { continue }

          if (event.type === 'sources') pendingSources = event.sources as Source[]

          if (event.type === 'token') {
            setMessages(prev => {
              const updated = [...prev]
              const last = { ...updated[updated.length - 1] }
              last.content += event.token as string
              last.sources  = pendingSources
              updated[updated.length - 1] = last
              return updated
            })
          }
          if (event.type === 'done') {
            options.onSessionCreated?.(event.session_id as number)
            setMessages(prev => {
              const updated = [...prev]
              // Update assistant message ID
              updated[updated.length - 1] = { ...updated[updated.length - 1], id: event.message_id as number, streaming: false }
              // Update user message ID
              updated[updated.length - 2] = { ...updated[updated.length - 2], id: event.user_message_id as number }
              return updated
            })
          }
          if (event.type === 'error') {
            setError(event.detail as string)
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = { role: 'assistant', content: `Error: ${event.detail}`, streaming: false }
              return updated
            })
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'Connection failed'
      setError(msg)
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: `Failed: ${msg}`, streaming: false }
        return updated
      })
    } finally {
      setStreaming(false)
    }
  }, [streaming, options])

  const abort = useCallback(() => {
    abortRef.current?.abort()
    setStreaming(false)
    setMessages(prev => {
      const updated = [...prev]
      const last = updated[updated.length - 1]
      if (last?.streaming) updated[updated.length - 1] = { ...last, streaming: false, content: last.content || '_(stopped)_' }
      return updated
    })
  }, [])

  const reset = useCallback(() => { setMessages([]); setError(null); setStreaming(false) }, [])

  return { messages, streaming, error, sendMessage, abort, reset, setMessages }
}
