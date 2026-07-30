import { AudioLines, Guitar } from 'lucide-react'
import type { RecordingType } from '../types'
import { Modal } from './Modal'

interface RecordingTypeModalProps {
  open: boolean
  onClose: () => void
  onSelect: (type: RecordingType) => void
}

const recordingTypes = [
  {
    type: 'instrument' as const,
    title: '录制乐器灵感',
    description: '捕捉旋律、和弦或节奏片段',
    icon: Guitar,
  },
  {
    type: 'vocal' as const,
    title: '录制哼唱灵感',
    description: '用声音快速记下脑海中的旋律',
    icon: AudioLines,
  },
]

export function RecordingTypeModal({ open, onClose, onSelect }: RecordingTypeModalProps) {
  return (
    <Modal open={open} onOpenChange={(next) => !next && onClose()} title="想录下什么？" description="选择灵感类型后开始录制。" size="sm">
      <div className="recording-type-panel">
        {recordingTypes.map(({ type, title, description, icon: Icon }) => (
          <button key={type} className="recording-type-option" onClick={() => onSelect(type)}>
            <span className="recording-type-icon"><Icon size={24} strokeWidth={1.8} /></span>
            <span>
              <strong>{title}</strong>
              <small>{description}</small>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
