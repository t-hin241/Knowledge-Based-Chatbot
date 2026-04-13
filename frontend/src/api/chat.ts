import api from './client'
export interface Source { type: 'document'|'web'; document_id?: number; filename?: string; label?: string; chunk_index?: number; url?: string; title?: string }
export interface Message { id: number; session_id: number; role: 'user'|'assistant'|'system'; content: string; sources: Source[]|null; created_at: string }
export interface Session { id: number; title: string; created_at: string; updated_at: string }
export const chatApi = {
  listSessions: () => api.get<{ sessions: Session[]; total: number }>('/chat/sessions'),
  getSession: (id: number) => api.get<{ session: Session; messages: Message[] }>(`/chat/sessions/${id}`),
  deleteSession: (id: number) => api.delete(`/chat/sessions/${id}`),
  deleteMessage: (id: number) => api.delete(`/chat/messages/${id}`),
}
