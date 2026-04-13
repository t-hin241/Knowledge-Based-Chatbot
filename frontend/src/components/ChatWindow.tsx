import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()
  const { messages, streaming, error, sendMessage, abort, reset, setMessages } = useSSEChat({
    onSessionCreated: async (id) => {
      const { data } = await chatApi.listSessions().catch(() => ({ data: { sessions: [] } }))
      onSessionCreated(id, data.sessions)
    }
  })
  
  const [input, setInput]           = useState('')
  const [webSearch, setWebSearch] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textRef   = useRef<HTMLTextAreaElement>(null)

  // Plan limit UI
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [limitType, setLimitType] = useState<'docs' | 'requests' | null>(null)

  useEffect(() => {
    if (error?.includes('PLAN_LIMIT_REQUESTS')) {
      setLimitType('requests')
      setShowUpgradeModal(true)
    } else if (error?.includes('PLAN_LIMIT_DOCS')) {
      setLimitType('docs')
      setShowUpgradeModal(true)
    }
  }, [error])

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

    const userMsg = messages[index]
    const assistantMsg = messages[index + 1]

    try {
      if (assistantMsg?.id) await chatApi.deleteMessage(assistantMsg.id)
      if (userMsg.id) await chatApi.deleteMessage(userMsg.id)

      const truncated = messages.slice(0, index)
      setMessages(truncated)
      await sendMessage(newContent, sessionId, selectedDocs.length ? selectedDocs.map(d => d.id) : null, webSearch)
    } catch (err) {
      console.error('Failed to edit/regenerate:', err)
    }
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center animate-fade-up">
            <div className="w-20 h-20 relative group">
               <div className="absolute inset-0 bg-amber-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
               <img 
                 src="https://cdn-1.webcatalog.io/catalog/browsercat/browsercat-icon-filled-256.png?v=1741746785186" 
                 className="w-full h-full relative z-10 drop-shadow-2xl scale-110" 
                 alt="Logo" 
               />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Ask Talk2Doc anything</h2>
              <p className="text-zinc-500 text-xs mt-1 font-mono">
                {selectedDocs.length
                  ? `Grounded on ${selectedDocs.length} document${selectedDocs.length > 1 ? 's' : ''}`
                  : 'Select documents or enable web search'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-sm">
              {STARTERS.map(p => (
                <button key={p} onClick={() => setInput(p)}
                  className="reactive text-[11px] px-4 py-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 text-zinc-400
                             hover:border-amber-500/30 hover:text-amber-400 transition-all font-mono">
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

        {error && !streaming && !showUpgradeModal && (
          <p className="text-[11px] text-red-100/40 font-mono text-center bg-red-500/10 py-2 rounded-lg border border-red-500/20 max-w-sm mx-auto">
            {error}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-zinc-800/60 p-4 bg-[#0b0b0d] shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">
        {/* Pills row */}
        <div className="flex items-center gap-2 mb-3 px-1 flex-wrap">
          {selectedDocs.map(d => (
            <span key={d.id} className="text-[10px] font-mono px-3 py-1 rounded-xl
                                        bg-amber-500/5 border border-amber-500/20 text-amber-500/80">
              {d.filename.slice(0, 24)}{d.filename.length > 24 ? '…' : ''}
            </span>
          ))}

          {/* Web search toggle */}
          <label className="flex items-center gap-2 ml-auto cursor-pointer select-none shrink-0 border border-zinc-800 rounded-2xl px-3 py-1 bg-zinc-900/40 hover:bg-zinc-800/40 transition-colors">
            <span className="text-[10px] text-zinc-500 font-mono font-bold uppercase tracking-wider">Web Search</span>
            <div onClick={() => setWebSearch(v => !v)}
              className={`w-7 h-4 rounded-full relative cursor-pointer transition-colors
                         ${webSearch ? 'bg-amber-500' : 'bg-zinc-700'}`}>
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all
                               ${webSearch ? 'left-3.5' : 'left-0.5'}`} />
            </div>
          </label>
        </div>

        <div className="flex gap-3 items-end">
          <textarea
            ref={textRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 128) + 'px' }}
            placeholder="Search documents or chat naturally..."
            rows={1}
            className="flex-1 resize-none bg-zinc-950 border border-zinc-800 rounded-2xl
                       px-4 py-3.5 text-sm text-zinc-100 placeholder:text-zinc-700 font-mono
                       focus:outline-none focus:border-amber-500/40 focus:bg-zinc-950 transition-all shadow-inner"
            style={{ minHeight: '48px', maxHeight: '160px' }}
          />

          {streaming ? (
            <button onClick={abort}
              className="reactive shrink-0 w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20
                         text-red-500 hover:bg-red-500/20 active:scale-95 transition-all flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim()}
              className="reactive shrink-0 w-12 h-12 rounded-2xl bg-amber-500 hover:bg-amber-400
                         disabled:bg-zinc-900 disabled:text-zinc-700 shadow-lg shadow-amber-500/10
                         text-zinc-950 active:scale-95 transition-all flex items-center justify-center"
              style={{ boxShadow: input.trim() ? '0 8px 24px -8px rgba(251,191,36,0.5)' : 'none' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Upgrade Recommendation Modal */}
      {showUpgradeModal && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-[#0c0c0e] border border-amber-500/30 rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl shadow-amber-500/10 space-y-6 text-center transform animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-3xl mx-auto flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6"/>
                <path d="M12 3v12"/>
                <path d="m5 21 14 0"/>
              </svg>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-zinc-100 italic">
                {limitType === 'requests' ? 'Daily Limit Reached' : 'Document Limit Reached'}
              </h3>
              <p className="text-sm text-zinc-500 font-mono leading-relaxed px-4">
                {limitType === 'requests' 
                  ? 'You successfully used your 15 messages for today! Upgrade for unlimited research.'
                  : 'Selected too many files? Free tier allows 2 documents. Pro tier grants unlimited context.'}
              </p>
            </div>

            <div className="flex flex-col gap-3 pt-4">
              <button 
                onClick={() => navigate('/profile')}
                className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-900 font-bold py-4 rounded-2xl transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98]">
                Upgrade to Pro
              </button>
              <button 
                onClick={() => { setShowUpgradeModal(false); reset() }}
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-zinc-500 font-mono text-[10px] py-3 rounded-2xl transition-all">
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
