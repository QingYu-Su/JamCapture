import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { InspirationTrack } from '../types'
import { Modal } from './Modal'

interface EditTrackModalProps {
  track: InspirationTrack | null
  onClose: () => void
  onSave: (track: InspirationTrack) => Promise<void>
  onDelete: (track: InspirationTrack) => Promise<void>
}

export function EditTrackModal({ track, onClose, onSave, onDelete }: EditTrackModalProps) {
  const [draft, setDraft] = useState(track)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => { setDraft(track); setConfirmDelete(false) }, [track])
  if (!draft) return null
  const updateTag = (key: keyof InspirationTrack['tags'], value: string) => setDraft({ ...draft, tags: { ...draft.tags, [key]: value } })
  return (
    <Modal open={Boolean(track)} onOpenChange={(open) => !open && onClose()} title="编辑灵感" description="整理标题和标签，让下一次找到它更容易。" size="sm">
      <div className="form-stack">
        <label className="field-label">标题<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} autoFocus /></label>
        <div className="field-grid">
          <label className="field-label">风格<input value={draft.tags.style} onChange={(event) => updateTag('style', event.target.value)} /></label>
          <label className="field-label">乐器<input value={draft.tags.instrument} onChange={(event) => updateTag('instrument', event.target.value)} /></label>
          <label className="field-label">情绪<input value={draft.tags.mood} onChange={(event) => updateTag('mood', event.target.value)} /></label>
          <label className="field-label">速度<input value={draft.tags.bpm} onChange={(event) => updateTag('bpm', event.target.value)} /></label>
        </div>
        <div className="dialog-footer danger-split">
          {confirmDelete ? <div className="delete-confirm"><span>确定永久删除？</span><button onClick={() => setConfirmDelete(false)}>取消</button><button className="danger-button" onClick={() => void onDelete(draft)}>删除</button></div> : <button className="delete-button" onClick={() => setConfirmDelete(true)}><Trash2 size={16} />删除灵感</button>}
          <button className="primary-button" disabled={!draft.title.trim()} onClick={() => void onSave(draft)}>保存修改</button>
        </div>
      </div>
    </Modal>
  )
}
