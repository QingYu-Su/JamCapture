import { AudioLines, Guitar } from 'lucide-react'
import type { RecordingType } from '../types'
import { Modal } from './Modal'

interface RecordingTypeModalProps {
  open: boolean
  onClose: () => void
  onSelect: (type: RecordingType) => void
  action?: 'record' | 'upload'
}

export function RecordingTypeModal({ open, onClose, onSelect, action = 'record' }: RecordingTypeModalProps) {
  const isUpload = action === 'upload'
  const recordingTypes = [
    {
      type: 'instrument' as const,
      title: `${isUpload ? '上传' : '录制'}乐器灵感`,
      description: isUpload ? '导入乐器演奏、旋律、和弦或节奏片段' : '捕捉旋律、和弦或节奏片段',
      icon: Guitar,
    },
    {
      type: 'vocal' as const,
      title: `${isUpload ? '上传' : '录制'}哼唱灵感`,
      description: isUpload ? '导入用人声哼唱记录的旋律片段' : '用声音快速记下脑海中的旋律',
      icon: AudioLines,
    },
  ]
  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={isUpload ? '要上传哪种灵感？' : '想录下什么？'}
      description={`选择灵感类型后${isUpload ? '选取音频文件' : '开始录制'}。`}
      size="sm"
    >
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
