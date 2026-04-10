import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import { authApi } from './api/auth'
import Login    from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Profile   from './pages/Profile'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, isAuthenticated } = useAuthStore()
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { token, setAuth, clearAuth, user } = useAuthStore()

  // On first load, fetch the user profile from the stored token
  useEffect(() => {
    if (token && !user) {
      authApi.me().then(r => {
        setAuth(token, r.data.user)
      }).catch(() => {
        clearAuth()
      })
    }
  }, [])

  return (
    <Routes>
      <Route path="/login"    element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={
        <RequireAuth><Dashboard /></RequireAuth>
      } />
      <Route path="/profile" element={
        <RequireAuth><Profile /></RequireAuth>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>

  )
}
