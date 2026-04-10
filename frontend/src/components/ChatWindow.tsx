import { useEffect, useRef, useState } from 'react'
import { useSSEChat, ChatMessage } from '../hooks/useSSEChat'
import MessageBubble from './MessageBubble'
import { Document } from '../api/documents'
import { Session, chatApi } from '../api/chat'

interface Props {
  sessionId: number | null
  sessionData: Session | null
  initialMessages?: ChatMessage[]
  selectedDocs: Document[]
  onSessionCreated: (id: number, updatedSessions: Session[]) => void
}

const STARTERS = ['Summarise the key points', 'What are the main findings?', 'Explain in simple terms']

function fmtTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ChatWindow({ sessionId, sessionData, initialMessages = [], selectedDocs, onSessionCreated }: Props) {
  const { messages, streaming, error, sendMessage, abort, reset, setMessages } = useSSEChat({
    onSessionCreated: async (id) => {
      const { data } = await chatApi.listSessions().catch(() => ({ data: { sessions: [] } }))
      onSessionCreated(id, data.sessions)
    }
  })
  const [input, setInput]         = useState('')
  const [webSearch, setWebSearch] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textRef   = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    reset()
    if (initialMessages.length) setMessages(initialMessages)
  }, [initialMessages, reset, setMessages])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    textRef.current!.style.height = 'auto'
    await sendMessage(text, sessionId, selectedDocs.length ? selectedDocs.map(d => d.id) : null, webSearch)
  }

  const handleEditMessage = async (index: number, newContent: string) => {
    if (streaming) return

    // 1. Identify messages to delete (user message + its assistant response if exists)
    const userMsg = messages[index]
    const assistantMsg = messages[index + 1]

    try {
      if (assistantMsg?.id) await chatApi.deleteMessage(assistantMsg.id)
      if (userMsg.id) await chatApi.deleteMessage(userMsg.id)

      // 2. Truncate local state
      const truncated = messages.slice(0, index)
      setMessages(truncated)

      // 3. Re-trigger sending with new content
      // This will append a new User & Assistant pair to both local and DB state
      await sendMessage(newContent, sessionId, selectedDocs.length ? selectedDocs.map(d => d.id) : null, webSearch)
    } catch (err) {
      console.error('Failed to edit/regenerate:', err)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-800/40
                            flex items-center justify-center"
                 style={{ boxShadow: '0 0 30px rgba(245,158,11,0.1)' }}>
              <span className="text-amber-400 font-mono text-xl font-medium">td</span>
            </div>
            <div>
              <p className="text-zinc-200 font-semibold">Ask Talk2Doc anything</p>
              <p className="text-zinc-500 text-xs mt-1 font-mono">
                {selectedDocs.length
                  ? `Grounded on ${selectedDocs.length} document${selectedDocs.length > 1 ? 's' : ''}`
                  : 'Select documents or enable web search'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-xs">
              {STARTERS.map(p => (
                <button key={p} onClick={() => setInput(p)}
                  className="text-xs px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-500
                             hover:border-amber-800/60 hover:text-amber-400 transition-colors font-mono">
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble
            key={i}
            message={m}
            isLast={i === messages.length - 2 || (i === messages.length - 1 && m.role === 'user')}
            onEdit={newContent => handleEditMessage(i, newContent)}
          />
        ))}

        {error && !streaming && (
          <p className="text-[11px] text-red-400 font-mono text-center">{error}</p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-zinc-800/60 px-4 py-3 bg-[#0c0c0e]">
        {/* Pills row */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {selectedDocs.map(d => (
            <span key={d.id} className="text-[10px] font-mono px-2 py-0.5 rounded-full
                                        bg-amber-500/10 border border-amber-800/40 text-amber-400">
              {d.filename.slice(0, 18)}{d.filename.length > 18 ? '…' : ''}
            </span>
          ))}

          {/* Web search toggle */}
          <label className="flex items-center gap-1.5 ml-auto cursor-pointer select-none shrink-0">
            <div onClick={() => setWebSearch(v => !v)}
              className={`w-7 h-4 rounded-full relative cursor-pointer transition-colors
                         ${webSearch ? 'bg-amber-500' : 'bg-zinc-700'}`}>
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all
                               ${webSearch ? 'left-3.5' : 'left-0.5'}`} />
            </div>
            <span className="text-[11px] text-zinc-500 font-mono">web</span>
          </label>
        </div>

        {/* Textarea row */}
        <div className="flex gap-2 items-end">
          <textarea
            ref={textRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 128) + 'px' }}
            placeholder="Ask anything… (⏎ send, Shift+⏎ newline)"
            rows={1}
            className="flex-1 resize-none bg-zinc-900 border border-zinc-700 rounded-xl
                       px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 font-mono
                       focus:outline-none focus:border-zinc-500 transition-colors"
            style={{ minHeight: '42px', maxHeight: '128px' }}
          />

          {streaming ? (
            <button onClick={abort}
              className="shrink-0 w-10 h-10 rounded-xl bg-red-500/10 border border-red-800/50
                         text-red-400 hover:bg-red-500/20 transition-colors flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim()}
              className="shrink-0 w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-400
                         disabled:bg-zinc-800 disabled:text-zinc-600
                         text-zinc-900 transition-colors flex items-center justify-center">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
