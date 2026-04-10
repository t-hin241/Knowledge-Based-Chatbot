import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { chatApi, Session } from '../api/chat'
import { documentsApi, Document } from '../api/documents'
import SessionList from '../components/SessionList'
import DocUploader from '../components/DocUploader'
import ChatWindow from '../components/ChatWindow'
import { ChatMessage } from '../hooks/useSSEChat'

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-zinc-600', processing: 'bg-amber-400 animate-pulse',
  ready: 'bg-green-400', error: 'bg-red-400',
}

export default function Dashboard() {
  const { clearAuth, user } = useAuthStore()
  const navigate = useNavigate()
  const [sessions, setSessions]           = useState<Session[]>([])
  const [activeSession, setActiveSession] = useState<number | null>(null)
  const [activeSessionData, setActiveSessionData] = useState<Session | null>(null)
  const [initMessages, setInitMessages]   = useState<ChatMessage[]>([])
  const [docs, setDocs]                   = useState<Document[]>([])
  const [selectedDocs, setSelectedDocs]   = useState<Document[]>([])
  const [sideTab, setSideTab]             = useState<'docs' | 'history'>('docs')

  useEffect(() => {
    chatApi.listSessions().then(r => setSessions(r.data.sessions)).catch(() => {})
    documentsApi.list().then(r => setDocs(r.data.documents)).catch(() => {})
  }, [])

  const handleSessionSelect = async (id: number) => {
    setActiveSession(id)
    setInitMessages([])
    try {
      const { data } = await chatApi.getSession(id)
      setActiveSessionData(data.session)
      setInitMessages(data.messages
        .filter(m => m.role !== 'system')
        .map(m => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content, sources: m.sources ?? undefined, sentAt: m.created_at }))
      )
    } catch { setInitMessages([]) }
  }

  const handleDocUploaded = (doc: Document) =>
    setDocs(prev => {
      const idx = prev.findIndex(d => d.id === doc.id)
      if (idx >= 0) { const n = [...prev]; n[idx] = doc; return n }
      return [doc, ...prev]
    })

  const handleDocDelete = async (id: number) => {
    await documentsApi.delete(id).catch(() => {})
    setDocs(prev => prev.filter(d => d.id !== id))
    setSelectedDocs(prev => prev.filter(d => d.id !== id))
  }

  const toggleDoc = (doc: Document) => {
    if (doc.status !== 'ready') return
    setSelectedDocs(prev =>
      prev.find(d => d.id === doc.id) ? prev.filter(d => d.id !== doc.id) : [...prev, doc]
    )
  }

  const fmt = (b: number) =>
    b < 1024 ? `${b}B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(0)}KB` : `${(b / 1024 ** 2).toFixed(1)}MB`

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-zinc-800/60 flex flex-col bg-[#0c0c0e]">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-zinc-800/60 flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-700/50
                          flex items-center justify-center">
            <span className="text-amber-400 font-mono text-[10px] font-medium">td</span>
          </div>
          <span className="font-semibold text-sm tracking-wide text-zinc-100">Talk2Doc</span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800/60">
          {(['docs', 'history'] as const).map(t => (
            <button key={t} onClick={() => setSideTab(t)}
              className={`flex-1 py-2.5 text-[10px] font-mono transition-colors
                         ${sideTab === t ? 'text-amber-400 border-b border-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {t === 'docs' ? 'documents' : 'history'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-3">
          {sideTab === 'docs' ? (
            <div className="flex flex-col gap-2">
              <DocUploader onUploaded={handleDocUploaded} />
              {docs.length === 0 && (
                <p className="text-[10px] text-zinc-600 font-mono text-center py-3">No documents</p>
              )}
              {docs.map(doc => {
                const selected = !!selectedDocs.find(d => d.id === doc.id)
                return (
                  <div key={doc.id} onClick={() => toggleDoc(doc)}
                    className={`group flex flex-col gap-1 px-2.5 py-2 rounded-lg border
                                transition-all cursor-pointer
                                ${selected ? 'border-amber-700/60 bg-amber-500/5' : 'border-zinc-800 hover:border-zinc-600 bg-zinc-900/30'}
                                ${doc.status !== 'ready' ? 'cursor-default opacity-70' : ''}`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[doc.status]}`} />
                      <span className="text-[11px] font-mono text-zinc-300 truncate flex-1">{doc.filename}</span>
                      <button onClick={e => { e.stopPropagation(); handleDocDelete(doc.id) }}
                        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 text-[10px] transition-all">
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <SessionList
              sessions={sessions}
              activeId={activeSession}
              onSelect={handleSessionSelect}
              onNew={() => { setActiveSession(null); setActiveSessionData(null); setInitMessages([]) }}
              onDelete={id => setSessions(prev => prev.filter(s => s.id !== id))}
            />
          )}
        </div>

        {/* User footer */}
        <div className="border-t border-zinc-800/60 px-3 py-3 flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-zinc-800 border border-zinc-700
                          flex items-center justify-center shrink-0 overflow-hidden">
            {user?.avatar_url ? (
               <img src={`/api/v1/uploads/${user.avatar_url}`} 
                    className="w-full h-full object-cover" alt="" />
            ) : (
              <span className="text-zinc-400 font-mono text-[9px] uppercase">
                {user?.username?.[0] ?? 'U'}
              </span>
            )}
          </div>
          <span className="flex-1 text-[11px] text-zinc-400 font-mono truncate">
            {user?.username ?? 'user'}
          </span>
          <button onClick={() => navigate('/profile')}
            className="text-zinc-600 hover:text-amber-500 transition-colors shrink-0 p-1">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" 
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
               <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
             </svg>
          </button>
          <button onClick={() => { clearAuth(); navigate('/login') }}
            className="text-[10px] font-mono text-zinc-600 hover:text-red-400 transition-colors shrink-0">
            out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-zinc-800/60 px-5 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-zinc-300 truncate">
              {activeSessionData?.title ?? 'New conversation'}
            </p>
            <p className="text-[10px] text-zinc-600 font-mono truncate">
              {activeSessionData
                ? `Last active ${new Date(activeSessionData.updated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                : selectedDocs.length > 0
                  ? `${selectedDocs.length} doc${selectedDocs.length > 1 ? 's' : ''} selected — click sidebar to deselect`
                  : 'Select documents from sidebar to ground responses'}
            </p>
          </div>
          {selectedDocs.length > 0 && (
            <button onClick={() => setSelectedDocs([])}
              className="text-[10px] font-mono text-zinc-500 hover:text-amber-400 transition-colors shrink-0">
              clear
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0">
          <ChatWindow
            sessionId={activeSession}
            sessionData={activeSessionData}
            initialMessages={initMessages}
            selectedDocs={selectedDocs}
            onSessionCreated={(id, sessions) => {
              setActiveSession(id)
              const found = sessions.find(s => s.id === id) ?? null
              setActiveSessionData(found)
              chatApi.listSessions().then(r => setSessions(r.data.sessions)).catch(() => {})
            }}
          />
        </div>
      </main>
    </div>
  )
}
