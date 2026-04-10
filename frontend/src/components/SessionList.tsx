import { Session, chatApi } from '../api/chat'

interface Props {
  sessions: Session[]
  activeId: number | null
  onSelect: (id: number) => void
  onNew: () => void
  onDelete: (id: number) => void
}

export default function SessionList({ sessions, activeId, onSelect, onNew, onDelete }: Props) {
  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    await chatApi.deleteSession(id).catch(() => {})
    onDelete(id)
  }

  return (
    <div className="flex flex-col gap-1">
      <button onClick={onNew}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono
                   border border-zinc-700 text-zinc-400 hover:border-amber-800
                   hover:text-amber-400 transition-colors mb-2">
        + New chat
      </button>
      {sessions.length === 0 && (
        <p className="text-[11px] text-zinc-600 font-mono px-1 py-2">No history yet</p>
      )}
      {sessions.map(s => (
        <div key={s.id} onClick={() => onSelect(s.id)}
          className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer
                      transition-colors border
                      ${activeId === s.id
                        ? 'bg-amber-500/10 border-amber-800/50 text-amber-300'
                        : 'border-transparent text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}>
          <span className="flex-1 truncate font-mono text-[11px]">{s.title}</span>
          <button onClick={e => handleDelete(e, s.id)}
            className="opacity-0 group-hover:opacity-100 text-zinc-600
                       hover:text-red-400 text-[10px] transition-all shrink-0">
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
