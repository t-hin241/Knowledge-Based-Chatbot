import { create } from 'zustand'
interface User { id: number; email: string; username: string; avatar_url?: string; plan: string }
interface AuthState {
  token: string | null; user: User | null
  setAuth: (token: string, user: User) => void
  clearAuth: () => void
  isAuthenticated: () => boolean
}
export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('talk2doc_token'),
  user: null,
  setAuth: (token, user) => { localStorage.setItem('talk2doc_token', token); set({ token, user }) },
  clearAuth: () => { localStorage.removeItem('talk2doc_token'); set({ token: null, user: null }) },
  isAuthenticated: () => !!get().token,
}))
