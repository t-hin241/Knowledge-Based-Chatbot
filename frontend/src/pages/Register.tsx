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
         style={{ background: 'radial-gradient(circle at 50% 10%, rgba(251,191,36,0.08) 0%, transparent 50%)' }}>
      <div className="w-full max-w-[360px] animate-fade-up">
        {/* Logo */}
        <div className="flex flex-col items-center text-center mb-10 group cursor-default">
          <div className="w-16 h-16 mb-4 relative">
             <div className="absolute inset-0 bg-amber-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
             <img 
               src="https://cdn-1.webcatalog.io/catalog/browsercat/browsercat-icon-filled-256.png?v=1741746785186" 
               className="w-full h-full relative z-10 drop-shadow-2xl" 
               alt="Talk2Doc Logo" 
             />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Talk2Doc</h1>
            <p className="text-[11px] text-zinc-500 font-mono uppercase tracking-[0.2em] mt-1">Intelligence Redefined</p>
          </div>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800/50 p-8 rounded-3xl backdrop-blur-xl shadow-2xl">
          <h2 className="text-lg font-semibold text-zinc-100 mb-1">Create account</h2>
          <p className="text-xs text-zinc-500 font-mono mb-8">
            Join the knowledge revolution
          </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" required autoFocus
            className="w-full bg-zinc-950/50 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm
                       text-zinc-100 placeholder:text-zinc-700 font-mono
                       focus:outline-none focus:border-amber-500/50 focus:bg-zinc-950 transition-all" />
          <input type="text" value={username} onChange={e => setUsername(e.target.value)}
            placeholder="Username" required
            className="w-full bg-zinc-950/50 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm
                       text-zinc-100 placeholder:text-zinc-700 font-mono
                       focus:outline-none focus:border-amber-500/50 focus:bg-zinc-950 transition-all" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" required minLength={8}
            className="w-full bg-zinc-950/50 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm
                       text-zinc-100 placeholder:text-zinc-700 font-mono
                       focus:outline-none focus:border-amber-500/50 focus:bg-zinc-950 transition-all" />

          {err && <p className="text-[11px] text-red-400 font-mono text-center mb-4">{err}</p>}

          <button type="submit" disabled={loading}
            className="reactive w-full bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800
                       disabled:text-zinc-600 text-zinc-900 font-bold text-sm
                       rounded-2xl py-3.5 transition-all shadow-lg shadow-amber-500/10">
            {loading ? 'Creating…' : 'Get Started'}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-zinc-500 font-mono">
          Already have an account? <Link to="/login" className="text-amber-400 hover:text-amber-300 transition-colors font-bold underline underline-offset-4 decoration-amber-500/30">Sign in</Link>
        </p>
      </div>
    </div>
  </div>
)
}
