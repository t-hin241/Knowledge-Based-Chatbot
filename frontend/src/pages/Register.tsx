import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '../api/auth'
import { useAuthStore } from '../store/auth'

export default function Register() {
  const [email, setEmail]       = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr]           = useState('')
  const [loading, setLoading]   = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(''); setLoading(true)
    try {
      const { data: tokens } = await authApi.register(email, username, password)
      localStorage.setItem('talk2doc_token', tokens.access_token)
      const { data: me } = await authApi.me()
      setAuth(tokens.access_token, me.user)
      navigate('/')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setErr(msg ?? 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.05) 0%, transparent 60%)' }}>
      <div className="w-full max-w-sm animate-fade-up">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-700/50
                          flex items-center justify-center"
               style={{ boxShadow: '0 0 24px rgba(245,158,11,0.12)' }}>
            <span className="text-amber-400 font-mono text-sm font-medium">td</span>
          </div>
          <div>
            <p className="font-semibold text-zinc-100 text-sm">Talk2Doc</p>
            <p className="text-[11px] text-zinc-500 font-mono">knowledge assistant</p>
          </div>
        </div>

        <h1 className="text-xl font-semibold text-zinc-100 mb-1">Create account</h1>
        <p className="text-sm text-zinc-500 font-mono mb-6">
          Have one? <Link to="/login" className="text-amber-400 hover:underline">Sign in</Link>
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" required autoFocus
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm
                       text-zinc-100 placeholder:text-zinc-600 font-mono
                       focus:outline-none focus:border-zinc-500 transition-colors" />
          <input type="text" value={username} onChange={e => setUsername(e.target.value)}
            placeholder="Username (letters, numbers, _)" required
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm
                       text-zinc-100 placeholder:text-zinc-600 font-mono
                       focus:outline-none focus:border-zinc-500 transition-colors" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password (min 8 chars)" required minLength={8}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm
                       text-zinc-100 placeholder:text-zinc-600 font-mono
                       focus:outline-none focus:border-zinc-500 transition-colors" />

          {err && <p className="text-[11px] text-red-400 font-mono">{err}</p>}

          <button type="submit" disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800
                       disabled:text-zinc-600 text-zinc-900 font-semibold text-sm
                       rounded-xl py-3 transition-colors">
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
