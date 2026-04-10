import api from './client'
export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'error'
export interface Document {
  id: number; filename: string; content_type: string; size_bytes: number
  status: DocumentStatus; chunk_count: number; error_message: string | null; created_at: string
}
export const documentsApi = {
  upload: (file: File) => {
    const form = new FormData(); form.append('file', file)
    return api.post<Document>('/documents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  list: () => api.get<{ documents: Document[]; total: number }>('/documents'),
  get: (id: number) => api.get<Document>(`/documents/${id}`),
  delete: (id: number) => api.delete(`/documents/${id}`),
}
