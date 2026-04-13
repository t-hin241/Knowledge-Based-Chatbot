import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { authApi } from '../api/auth'
import { useAuthStore } from '../store/auth'

export default function Profile() {
  const { user, setAuth } = useAuthStore()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [upgradingPlan, setUpgradingPlan] = useState(false)

  const getAvatarUrl = (path?: string) => {
    if (!path) return null
    return `/api/v1/uploads/${path}`
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setUploadingAvatar(true)
    try {
      const { data } = await authApi.uploadAvatar(file)
      setAuth(localStorage.getItem('talk2doc_token') || '', data.user)
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to upload avatar")
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleUpgrade = async (plan: 'free' | 'pro') => {
    setUpgradingPlan(true)
    try {
      const { data } = await authApi.updateMe({ plan })
      setAuth(localStorage.getItem('talk2doc_token') || '', data.user)
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to update plan")
    } finally {
      setUpgradingPlan(false)
    }
  }

  // Profile Form
  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail]       = useState(user?.email || '')
  const [profileMsg, setProfileMsg] = useState<{ type: 'err'|'ok', text: string } | null>(null)
  const [updatingProfile, setUpdatingProfile] = useState(false)

  // Password Form
  const [currPass, setCurrPass] = useState('')
  const [newPass, setNewPass]  = useState('')
  const [passMsg, setPassMsg]  = useState<{ type: 'err'|'ok', text: string } | null>(null)
  const [updatingPass, setUpdatingPass] = useState(false)

  // Stats
  const [usageData, setUsageData] = useState<{ date: string; total_minutes: number; displayDate?: string }[]>([])
  const [loadingStats, setLoadingStats] = useState(true)

  const formatMinutes = (mins: number) => {
    if (mins === 0) return '0m'
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  useEffect(() => {
    authApi.getUsage()
      .then(r => {
        const formatted = r.data.usage.map(d => ({
          ...d,
          displayDate: new Date(d.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
        }))
        setUsageData(formatted)
      })
      .catch(() => {})
      .finally(() => setLoadingStats(false))
  }, [])

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileMsg(null); setUpdatingProfile(true)
    try {
      const { data } = await authApi.updateMe({ username, email })
      setAuth(localStorage.getItem('talk2doc_token') || '', data.user)
      setProfileMsg({ type: 'ok', text: 'Profile updated successfully' })
    } catch (err: any) {
      setProfileMsg({ type: 'err', text: err.response?.data?.detail || 'Failed to update profile' })
    } finally { setUpdatingProfile(false) }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPassMsg(null); setUpdatingPass(true)
    try {
      await authApi.updateMe({ current_password: currPass, new_password: newPass })
      setPassMsg({ type: 'ok', text: 'Password changed successfully' })
      setCurrPass(''); setNewPass('')
    } catch (err: any) {
      setPassMsg({ type: 'err', text: err.response?.data?.detail || 'Failed to change password' })
    } finally { setUpdatingPass(false) }
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-12">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={onFileChange} 
              accept="image/*" 
              className="hidden" 
            />
            <div 
              onClick={handleAvatarClick}
              className="group relative w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-800/40
                          flex items-center justify-center cursor-pointer overflow-hidden transition-all
                          hover:border-amber-500/50"
              style={{ boxShadow: '0 0 30px rgba(245,158,11,0.1)' }}>
              
              {user?.avatar_url ? (
                <img 
                  src={getAvatarUrl(user.avatar_url)!} 
                  alt="Avatar" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-amber-400 font-mono text-xl font-medium">
                  {user?.username?.[0].toUpperCase() ?? 'U'}
                </span>
              )}

              {uploadingAvatar ? (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
              ) : (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">Account Settings</h1>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
                  ${user?.plan === 'pro' 
                    ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' 
                    : 'bg-zinc-800 text-zinc-500 border border-zinc-700'}`}>
                  {user?.plan || 'Free'}
                </span>
              </div>
              <p className="text-sm text-zinc-500 font-mono">Manage your profile and track active usage</p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/')}
            className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 text-xs font-mono
                       hover:border-zinc-600 hover:text-zinc-100 transition-all flex items-center gap-2">
            <span>←</span> Back to Chat
          </button>
        </div>

        {/* Subscription Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Subscription Plan</h2>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">Choose the tier that fits your workflow</p>
            </div>
            
            {/* Billing toggle */}
            <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-xl flex">
              <button 
                onClick={() => setBillingCycle('monthly')}
                className={`px-3 py-1 rounded-lg text-[10px] font-mono transition-all ${billingCycle === 'monthly' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
                Monthly
              </button>
              <button 
                onClick={() => setBillingCycle('yearly')}
                className={`px-3 py-1 rounded-lg text-[10px] font-mono transition-all ${billingCycle === 'yearly' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
                Yearly
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Free Plan */}
            <div className={`p-6 rounded-3xl border transition-all ${user?.plan !== 'pro' ? 'bg-zinc-900/40 border-amber-500/30 ring-1 ring-amber-500/20' : 'bg-zinc-900/20 border-zinc-800'}`}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-bold text-zinc-100 italic">Free</h3>
                  <div className="text-2xl font-semibold mt-2">0đ <span className="text-xs text-zinc-500 font-normal">/ perpetually</span></div>
                </div>
                {user?.plan !== 'pro' && <span className="text-[10px] font-bold text-amber-500 font-mono">Current Plan</span>}
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-xs text-zinc-400">
                  <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  10-15 requests per day
                </li>
                <li className="flex items-center gap-2 text-xs text-zinc-400">
                  <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Max 3 documents selected
                </li>
                <li className="flex items-center gap-2 text-xs text-zinc-500 line-through">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  Instant response priority
                </li>
              </ul>
            </div>

            {/* Pro Plan */}
            <div className={`p-6 rounded-3xl border transition-all relative overflow-hidden group ${user?.plan === 'pro' ? 'bg-zinc-900/40 border-amber-500/30 ring-1 ring-amber-500/20' : 'bg-zinc-900/20 border-zinc-800 hover:border-zinc-700'}`}>
              <div className="absolute top-0 right-0 p-4">
                <div className="bg-amber-500 text-zinc-900 text-[8px] font-black uppercase px-2 py-0.5 rounded tracking-tighter transform rotate-12 group-hover:rotate-0 transition-transform">Recommended</div>
              </div>

              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-bold text-amber-500 italic">Pro</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-2xl font-semibold">{billingCycle === 'monthly' ? '20k' : '200k'}</span>
                    <span className="text-xs text-zinc-500 font-normal">/ {billingCycle === 'monthly' ? 'month' : 'year'}</span>
                  </div>
                </div>
                {user?.plan === 'pro' && <span className="text-[10px] font-bold text-amber-500 font-mono">Active Tier</span>}
              </div>
              
              <ul className="space-y-3 mb-8 text-xs text-zinc-300">
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Unlimited requests per day
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Unlimited documents selected
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  No response delay
                </li>
              </ul>

              {user?.plan !== 'pro' ? (
                <button 
                  onClick={() => handleUpgrade('pro')}
                  disabled={upgradingPlan}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-900 text-xs font-bold py-3 rounded-2xl transition-all shadow-lg shadow-amber-500/10 active:scale-[0.98]">
                  {upgradingPlan ? 'Processing...' : 'Upgrade Tier'}
                </button>
              ) : (
                <button 
                  onClick={() => handleUpgrade('free')}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-[10px] font-mono py-2 rounded-2xl transition-all">
                  Switch back to Free
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-6 border-t border-zinc-800/40">
          
          {/* Left Column: Stats Chart */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-3xl p-6 relative overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-200">Activity Duration</h2>
                  <p className="text-[10px] text-zinc-500 font-mono">Active time spend over the last 7 days</p>
                </div>
                <div className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-mono">
                  Active Hours
                </div>
              </div>

              <div className="h-[240px] w-full">
                {loadingStats ? (
                  <div className="h-full w-full flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-zinc-800 border-t-amber-500 rounded-full animate-spin" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={usageData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" vertical={false} />
                      <XAxis 
                        dataKey="displayDate" 
                        stroke="#52525b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false} 
                        dy={10}
                      />
                      <YAxis 
                        stroke="#52525b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip 
                        cursor={{ fill: 'rgba(245, 158, 11, 0.05)' }}
                        formatter={(val: number) => [formatMinutes(val), 'Active Time']}
                        contentStyle={{ 
                          backgroundColor: '#18181b', 
                          border: '1px solid #27272a',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontFamily: 'monospace'
                        }}
                      />
                      <Bar dataKey="total_minutes" radius={[4, 4, 0, 0]}>
                        {usageData.map((_entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={index === usageData.length - 1 ? '#f59e0b' : '#3f3f46'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-5">
                  <p className="text-[10px] font-mono text-zinc-500 mb-1 uppercase">Total Active Time</p>
                  <p className="text-xl font-semibold text-zinc-100">
                    {formatMinutes(usageData.reduce((acc, curr) => acc + curr.total_minutes, 0))}
                  </p>
               </div>
               <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-5">
                  <p className="text-[10px] font-mono text-zinc-500 mb-1 uppercase">Avg. Daily Active</p>
                  <p className="text-xl font-semibold text-zinc-100">
                    {formatMinutes(Math.round(usageData.reduce((acc, curr) => acc + curr.total_minutes, 0) / 7))}
                  </p>
               </div>
            </div>
          </div>


          {/* Right Column: Forms */}
          <div className="space-y-6">
            
            {/* Profile Form */}
            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-3xl p-6">
              <h2 className="text-sm font-semibold text-zinc-200 mb-4">Edit Profile</h2>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-zinc-500 ml-1">Username</label>
                  <input
                    type="text" value={username} onChange={e => setUsername(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs
                               text-zinc-100 focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-zinc-500 ml-1">Email</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs
                               text-zinc-100 focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                </div>
                {profileMsg && (
                  <p className={`text-[10px] font-mono ${profileMsg.type === 'err' ? 'text-red-400' : 'text-green-400'}`}>
                    {profileMsg.text}
                  </p>
                )}
                <button type="submit" disabled={updatingProfile}
                  className="w-full bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-semibold
                             py-2.5 rounded-xl transition-all disabled:opacity-50">
                  {updatingProfile ? 'Saving...' : 'Update Settings'}
                </button>
              </form>
            </div>

            {/* Password Form */}
            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-3xl p-6">
              <h2 className="text-sm font-semibold text-zinc-200 mb-4">Security</h2>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-zinc-500 ml-1">Current Password</label>
                  <input
                    type="password" value={currPass} onChange={e => setCurrPass(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs
                               placeholder:text-zinc-700 text-zinc-100 focus:outline-none 
                               focus:border-amber-500/50 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-zinc-500 ml-1">New Password</label>
                  <input
                    type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs
                               placeholder:text-zinc-700 text-zinc-100 focus:outline-none 
                               focus:border-amber-500/50 transition-colors"
                  />
                </div>
                {passMsg && (
                  <p className={`text-[10px] font-mono ${passMsg.type === 'err' ? 'text-red-400' : 'text-green-400'}`}>
                    {passMsg.text}
                  </p>
                )}
                <button type="submit" disabled={updatingPass}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-900 text-xs font-semibold
                             py-2.5 rounded-xl transition-all disabled:opacity-50">
                  {updatingPass ? 'Changing...' : 'Change Password'}
                </button>
              </form>
            </div>

          </div>

        </div>
      </div>
    </div>
  )
}
