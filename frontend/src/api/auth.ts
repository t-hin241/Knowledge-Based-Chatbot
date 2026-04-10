import api from './client'
export interface TokenResponse { access_token: string; refresh_token: string; token_type: string }
export interface UserResponse { id: number; email: string; username: string; is_active: boolean; created_at: string; avatar_url?: string }
export const authApi = {
  register: (email: string, username: string, password: string) =>
    api.post<TokenResponse>('/auth/register', { email, username, password }),
  login: (email: string, password: string) =>
    api.post<TokenResponse>('/auth/login', { email, password }),
  me: () => api.get<{ user: UserResponse }>('/auth/me'),
  updateMe: (data: { email?: string; username?: string; current_password?: string; new_password?: string }) =>
    api.patch<{ user: UserResponse }>('/auth/me', data),
  getUsage: () => api.get<{ usage: { date: string; total_minutes: number }[] }>('/auth/usage'),
  uploadAvatar: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<{ user: UserResponse }>('/auth/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }
}
