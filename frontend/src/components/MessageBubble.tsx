import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChatMessage } from '../hooks/useSSEChat'
import { Source } from '../api/chat'
import { useAuthStore } from '../store/auth'

interface Props {
  message: ChatMessage
  onEdit?: (newContent: string) => void
  isLast?: boolean
}

function SourceTag({ source }: { source: Source }) {
  const label = source.type === 'web'
    ? (source.title ?? source.url ?? 'Web').slice(0, 32)
    : `${source.label ?? 'Doc'}: ${source.filename ?? 'Document'}`
  const dot = source.type === 'web' ? 'bg-blue-400' : 'bg-amber-400'

  if (source.type === 'web' && source.url) {
    return (
      <a href={source.url} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded
                   border border-zinc-700 text-zinc-400 hover:text-amber-400
                   hover:border-amber-800 transition-colors">
        <span className={`w-1.5 h-1.5 rounded-full ${dot} inline-block shrink-0`} />
        {label}
      </a>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded
                     border border-zinc-700 text-zinc-500">
      <span className={`w-1.5 h-1.5 rounded-full ${dot} inline-block shrink-0`} />
      {label}
    </span>
  )
}

function fmtMsgTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MessageBubble({ message, onEdit, isLast = false }: Props) {
  const { user } = useAuthStore()
  const isUser = message.role === 'user'
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText]   = useState(message.content)
  const textRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (isEditing && textRef.current) {
      textRef.current.style.height = 'auto'
      textRef.current.style.height = textRef.current.scrollHeight + 'px'
    }
  }, [isEditing, editText])

  const handleSave = () => {
    if (editText.trim() && editText !== message.content) {
      onEdit?.(editText)
    }
    setIsEditing(false)
  }

  return (
    <div className={`group flex gap-3 animate-fade-up ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`shrink-0 w-7 h-7 rounded flex items-center justify-center
                       text-[10px] font-mono font-medium mt-0.5 overflow-hidden
                       ${isUser
                         ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                         : 'bg-amber-500/10 text-amber-400 border border-amber-800/50'}`}>
        {isUser ? (
          user?.avatar_url ? (
            <img src={`/api/v1/uploads/${user.avatar_url}`} 
                 className="w-full h-full object-cover" alt="" />
          ) : (
            'you'
          )
        ) : 'td'}
      </div>

      <div className={`max-w-[80%] flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`relative rounded-xl px-4 py-3 text-sm transition-all
                         ${isUser
                           ? 'bg-zinc-800 border border-zinc-700 text-zinc-100'
                           : 'bg-[#111113] border border-zinc-800/60 text-zinc-100'}`}>
          {isUser ? (
            isEditing ? (
              <div className="flex flex-col gap-2 min-w-[200px]">
                <textarea
                  ref={textRef}
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 w-full resize-none
                             p-0 font-mono text-xs leading-relaxed text-zinc-100"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setIsEditing(false); setEditText(message.content) }}
                    className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSave}
                    className="text-[10px] font-mono text-amber-500 font-semibold hover:text-amber-400 transition-colors">
                    Save & Regenerate
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 items-start">
                {isLast && onEdit && (
                  <button onClick={() => setIsEditing(true)}
                    className="opacity-0 group-hover:opacity-100 transition-all p-1 -ml-6 -mt-1
                               text-zinc-600 hover:text-amber-500 rounded-md">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                )}
                <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{message.content}</p>
              </div>
            )
          ) : (
            <div className="prose-talk2doc">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
              {message.streaming && (
                <span className="inline-block w-0.5 h-3.5 bg-amber-400 ml-0.5
                                 align-middle animate-cursor-blink" />
              )}
            </div>
          )}
        </div>

        {/* Source tags — only after streaming done */}
        {!isUser && !message.streaming && message.sources && message.sources.length > 0 && (
          <div className="flex flex-col gap-2 px-1 mt-2">
            <div className="flex items-center gap-2 opacity-50">
               <div className="h-[1px] flex-1 bg-zinc-800" />
               <span className="text-[9px] uppercase tracking-wider font-bold text-zinc-500 font-mono">Related Documents</span>
               <div className="h-[1px] flex-1 bg-zinc-800" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(() => {
                const unique = new Map<string, Source>()
                message.sources.forEach(s => {
                  const key = s.type === 'web' ? (s.url || s.title) : String(s.document_id)
                  if (key && !unique.has(key)) unique.set(key, s)
                })
                return Array.from(unique.values()).map((s, i) => <SourceTag key={i} source={s} />)
              })()}
            </div>
          </div>
        )}

        {/* Sent time — suppressed while streaming */}
        {!message.streaming && message.sentAt && (
          <span className="text-[9px] font-mono text-zinc-600 px-1">
            {fmtMsgTime(message.sentAt)}
          </span>
        )}
      </div>
    </div>
  )
}

