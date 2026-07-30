import { useEffect, useState } from 'react'
import { LoaderCircle, Trash2 } from 'lucide-react'
import type { GeneratedTrack } from '../types'
import { Modal } from './Modal'

interface EditGeneratedModalProps {
  track: GeneratedTrack | null
  onClose: () => void
  onSave: (track: GeneratedTrack) => Promise<void>
  onDelete: (track: GeneratedTrack) => Promise<void>
}

function defaultTags(track: GeneratedTrack) {
  return [track.generationKind === 'full-song' ? '完整词曲' : '纯音乐', track.style].filter(Boolean)
}

function parseTags(value: string) {
  return [...new Set(value.split(/[,，\n]+/).map((tag) => tag.trim()).filter(Boolean))]
}

export function EditGeneratedModal({ track, onClose, onSave, onDelete }: EditGeneratedModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setTitle(track?.title ?? '')
    setDescription(track ? track.description ?? track.prompt : '')
    setTags(track ? (track.tags ?? defaultTags(track)).join('，') : '')
    setConfirmDelete(false)
    setSaving(false)
    setDeleting(false)
  }, [track])

  if (!track) return null
  const activeTrack = track

  async function save() {
    if (!title.trim() || saving || deleting) return
    setSaving(true)
    try {
      await onSave({ ...activeTrack, title: title.trim(), description: description.trim(), tags: parseTags(tags) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onOpenChange={(open) => !open && !saving && !deleting && onClose()} title="编辑延伸作品" description="整理作品信息，方便之后继续查找与分享。" size="sm">
      <div className="form-stack generated-edit-form">
        <label className="field-label">标题<input aria-label="作品标题" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></label>
        <label className="field-label">描述<textarea aria-label="作品描述" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="描述这首作品的创作方向与听感..." rows={5} /></label>
        <label className="field-label">标签<input aria-label="作品标签" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="多个标签使用逗号分隔" /></label>
        <p className="generated-edit-hint">多个标签可使用中文或英文逗号分隔</p>
        <div className="dialog-footer danger-split">
          {confirmDelete
            ? <div className="delete-confirm"><span>确定永久删除？</span><button disabled={deleting} onClick={() => setConfirmDelete(false)}>取消</button><button className="danger-button" disabled={deleting} onClick={async () => { setDeleting(true); try { await onDelete(activeTrack) } finally { setDeleting(false) } }}>{deleting && <LoaderCircle className="spin" size={14} />}删除</button></div>
            : <button className="delete-button" disabled={saving} onClick={() => setConfirmDelete(true)}><Trash2 size={16} />删除作品</button>}
          <button className="primary-button" disabled={!title.trim() || saving || deleting} onClick={() => void save()}>{saving && <LoaderCircle className="spin" size={16} />}保存修改</button>
        </div>
      </div>
    </Modal>
  )
}
