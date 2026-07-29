import { Check, Copy, Link2, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PlayableTrack } from '../types'
import { createReadOnlyShare } from '../services/shareClient'
import { Modal } from './Modal'

interface ShareTrackModalProps {
  track: PlayableTrack | null
  getBlob: (id: string) => Promise<Blob | undefined>
  onClose: () => void
}

export function ShareTrackModal({ track, getBlob, onClose }: ShareTrackModalProps) {
  const requestedTrack = useRef('')
  const linkInputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyHint, setCopyHint] = useState('')

  useEffect(() => {
    if (!track) {
      requestedTrack.current = ''
      return
    }
    if (requestedTrack.current === track.id) return
    requestedTrack.current = track.id
    setUrl('')
    setError('')
    setCopied(false)
    setCopyHint('')
    void createReadOnlyShare(track, getBlob).then(setUrl).catch((reason) => {
      setError(reason instanceof Error ? reason.message : '生成分享链接失败')
    })
  }, [getBlob, track])

  async function copyLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setCopyHint('链接已复制')
    } catch {
      // 非安全上下文可能禁用 Clipboard API，此时选中完整链接供用户手动复制。
      linkInputRef.current?.focus()
      linkInputRef.current?.select()
      setCopyHint('无法自动复制，已为你选中链接')
    }
  }

  return (
    <Modal open={Boolean(track)} onOpenChange={(open) => !open && onClose()} title={track?.kind === 'generated' ? '分享作品' : '分享灵感'} description="获得链接的人只能播放这段音频" size="sm">
      <div className="share-panel">
        <div className="share-track-name"><Link2 size={17} /><span>{track?.title}</span></div>
        {!url && !error && <div className="share-loading"><LoaderCircle className="spin" size={18} /><span>正在生成只读分享链接</span></div>}
        {error && <div className="share-error">{error}</div>}
        {url && <div className="share-link-row"><input ref={linkInputRef} readOnly value={url} aria-label="分享链接" onFocus={(event) => event.currentTarget.select()} /><button onClick={() => void copyLink()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? '已复制' : '复制链接'}</button></div>}
        {copyHint && <div className="share-copy-status" role="status">{copyHint}</div>}
      </div>
    </Modal>
  )
}
