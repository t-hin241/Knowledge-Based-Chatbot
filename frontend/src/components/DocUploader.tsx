import { useCallback, useRef, useState } from 'react'
import { documentsApi, Document } from '../api/documents'

interface Props { onUploaded: (doc: Document) => void }

export default function DocUploader({ onUploaded }: Props) {
  const [dragging, setDragging]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState<string | null>(null)
  const [err, setErr]             = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = useCallback(async (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!['.pdf', '.docx', '.txt'].includes(ext)) { setErr('Use PDF, DOCX, or TXT.'); return }
    if (file.size > 50 * 1024 * 1024) { setErr('Max 50 MB.'); return }

    setErr(null); setUploading(true); setProgress('Uploading…')
    try {
      const { data } = await documentsApi.upload(file)
      setProgress('Processing…')
      onUploaded(data)

      let attempts = 0
      const poll = setInterval(async () => {
        attempts++
        try {
          const { data: updated } = await documentsApi.get(data.id)
          onUploaded(updated)
          if (updated.status === 'ready' || updated.status === 'error' || attempts > 60) {
            clearInterval(poll)
            if (updated.status === 'error') setErr(updated.error_message || 'Processing failed')
            setProgress(null); setUploading(false)
          }
        } catch { clearInterval(poll); setUploading(false); setProgress(null) }
      }, 2000)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
      setUploading(false); setProgress(null)
    }
  }, [onUploaded])

  return (
    <div>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) upload(f) }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        className={`border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer select-none
                    ${dragging ? 'border-amber-500 bg-amber-500/5' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/40'}
                    ${uploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input ref={inputRef} type="file" className="hidden" accept=".pdf,.docx,.txt"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-[11px] text-amber-400 font-mono">{progress}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                 strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p className="text-[11px] text-zinc-400 font-mono">
              Drop or <span className="text-amber-400">browse</span>
            </p>
            <p className="text-[10px] text-zinc-600 font-mono">PDF · DOCX · TXT · 50MB</p>
          </div>
        )}
      </div>
      {err && <p className="text-[11px] text-red-400 font-mono mt-1.5 px-1">{err}</p>}
    </div>
  )
}
