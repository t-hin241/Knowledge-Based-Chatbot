import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { authApi } from '../api/auth'
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
  const { clearAuth, user, token, setAuth } = useAuthStore()
  const navigate = useNavigate()
  const [sessions, setSessions]           = useState<Session[]>([])
  const [activeSession, setActiveSession] = useState<number | null>(null)
  const [activeSessionData, setActiveSessionData] = useState<Session | null>(null)
  const [initMessages, setInitMessages]   = useState<ChatMessage[]>([])
  const [docs, setDocs]                   = useState<Document[]>([])
  const [selectedDocs, setSelectedDocs]   = useState<Document[]>([])
  const [sideTab, setSideTab]             = useState<'docs' | 'history'>('docs')
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isDarkTheme, setIsDarkTheme]     = useState(() => localStorage.getItem('theme') !== 'light')
  const [notificationsOn, setNotificationsOn] = useState(() => localStorage.getItem('notifications') === 'true')
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Rehydrate user if token exists but user object is missing (on refresh)
    if (token && !user) {
      authApi.me()
        .then(r => setAuth(token, r.data.user))
        .catch(() => { clearAuth(); navigate('/login') })
    }
  }, [token, user, setAuth, clearAuth, navigate])

  useEffect(() => {
    chatApi.listSessions().then(r => setSessions(r.data.sessions)).catch(() => {})
    documentsApi.list().then(r => setDocs(r.data.documents)).catch(() => {})
  }, [])

  // Apply theme to document and persist
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkTheme ? 'dark' : 'light')
    localStorage.setItem('theme', isDarkTheme ? 'dark' : 'light')
  }, [isDarkTheme])

  // Persist notifications preference
  useEffect(() => {
    localStorage.setItem('notifications', String(notificationsOn))
  }, [notificationsOn])

  // Close user menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
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
      <aside className="w-64 shrink-0 border-r border-zinc-800/60 flex flex-col bg-[#0b0b0d] shadow-2xl">
        {/* Logo */}
        <div className="px-6 py-8 flex flex-col items-center gap-3">
          <div className="w-12 h-12 relative group">
             <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
             <img 
               src="https://cdn-1.webcatalog.io/catalog/browsercat/browsercat-icon-filled-256.png?v=1741746785186" 
               className="w-full h-full relative z-10 drop-shadow-lg scale-110" 
               alt="Logo" 
             />
          </div>
          <div className="flex flex-col items-center">
            <span className="font-bold text-lg tracking-tight text-white leading-none">Talk2Doc</span>
            <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-[0.2em] mt-1.5">Knowledge Base</span>
          </div>
        </div>

        {/* User Info + Dropdown */}
        <div ref={userMenuRef} className="relative mx-4 mb-6">
          {/* Single bordered card: clickable profile area + divider + ⋮ button */}
          <div className="flex items-center bg-zinc-900/40 border border-zinc-800/50 rounded-2xl overflow-hidden hover:border-zinc-700/60 transition-colors">
            <button onClick={() => navigate('/profile')}
              className="flex items-center gap-3 flex-1 p-2.5 min-w-0 hover:bg-zinc-800/40 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center overflow-hidden shrink-0">
                {user?.avatar_url ? (
                  <img src={`/api/v1/uploads/${user.avatar_url}`} className="w-full h-full object-cover" alt="" />
                ) : (
                  <span className="text-amber-500 font-mono text-[10px] font-bold">{user?.username?.[0] || 'U'}</span>
                )}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-xs font-bold text-zinc-200 truncate">{user?.username}</p>
                <p className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider">{user?.plan} plan</p>
              </div>
            </button>

            {/* Thin divider */}
            <div className="w-px h-8 bg-zinc-800/80 shrink-0" />

            {/* Dropdown trigger — NO separate border, NO hover */}
            <button
              onClick={() => setIsUserMenuOpen(v => !v)}
              className={`shrink-0 w-10 h-full flex items-center justify-center transition-colors
                ${isUserMenuOpen ? 'text-amber-400' : 'text-zinc-500'}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
              </svg>
            </button>
          </div>

          {/* Dropdown menu */}
          {isUserMenuOpen && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/60 backdrop-blur-xl overflow-hidden">
              <div className="px-3 pt-3 pb-1">
                <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-zinc-600 mb-2 px-1">Settings</p>

                {/* Dark theme toggle */}
                <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-zinc-900 transition-colors">
                  <svg className="w-3.5 h-3.5 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                  <span className="flex-1 text-[11px] text-zinc-300 font-mono">Dark theme</span>
                  <button onClick={() => setIsDarkTheme(v => !v)}
                    className={`w-8 h-4 rounded-full relative transition-colors ${isDarkTheme ? 'bg-amber-500' : 'bg-zinc-700'}`}>
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all ${isDarkTheme ? 'left-4' : 'left-0.5'}`} />
                  </button>
                </div>

                {/* Notifications toggle */}
                <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-zinc-900 transition-colors">
                  <svg className="w-3.5 h-3.5 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                  <span className="flex-1 text-[11px] text-zinc-300 font-mono">Notifications</span>
                  <button onClick={() => setNotificationsOn(v => !v)}
                    className={`w-8 h-4 rounded-full relative transition-colors ${notificationsOn ? 'bg-amber-500' : 'bg-zinc-700'}`}>
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all ${notificationsOn ? 'left-4' : 'left-0.5'}`} />
                  </button>
                </div>

                {/* Report */}
                <button
                  onClick={() => { setIsUserMenuOpen(false); window.open('mailto:support@talk2doc.ai?subject=Report%20Issue', '_blank') }}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-zinc-900 transition-colors text-left">
                  <svg className="w-3.5 h-3.5 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <span className="text-[11px] text-zinc-300 font-mono">Make a report</span>
                </button>
              </div>

              <div className="mx-3 my-1 h-px bg-zinc-800/80" />

              <div className="px-3 pb-3 pt-1">
                <button
                  onClick={() => { setIsUserMenuOpen(false); clearAuth(); navigate('/login') }}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-red-500/10 transition-colors text-left group">
                  <svg className="w-3.5 h-3.5 text-zinc-500 group-hover:text-red-400 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  <span className="text-[11px] font-mono text-zinc-500 group-hover:text-red-400 transition-colors">Sign out</span>
                </button>
              </div>
            </div>
          )}
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
            notificationsEnabled={notificationsOn}
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
