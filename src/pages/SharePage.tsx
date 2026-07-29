import { AudioLines, LoaderCircle, LockKeyhole } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getSharedTrack, type SharedTrack } from '../services/shareClient'
import { formatDuration } from '../utils/format'
import { Waveform } from '../components/Waveform'

export function SharePage() {
  const { token = '' } = useParams()
  const [track, setTrack] = useState<SharedTrack | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void getSharedTrack(token).then(setTrack).catch((reason) => setError(reason instanceof Error ? reason.message : '分享内容加载失败'))
  }, [token])

  return (
    <main className="share-page">
      <div className="share-brand"><span><AudioLines size={21} /></span><strong>JamCapture</strong></div>
      {!track && !error && <div className="share-page-state"><LoaderCircle className="spin" size={23} /><span>正在加载分享的灵感</span></div>}
      {error && <div className="share-page-state share-page-error"><LockKeyhole size={24} /><strong>无法打开这条灵感</strong><span>{error}</span></div>}
      {track && (
        <article className="shared-track-card">
          <div className="shared-readonly"><LockKeyhole size={13} />只读分享</div>
          <h1>{track.title}</h1>
          <div className="shared-tags"><span>{track.tags.style}</span><span>{track.tags.instrument}</span><span>{track.tags.mood}</span><span>{track.tags.bpm}</span></div>
          <Waveform data={track.waveform} className="shared-waveform" />
          {track.description && <p>{track.description}</p>}
          <div className="shared-duration">时长 {formatDuration(track.duration)}</div>
          <audio controls controlsList="nodownload" preload="metadata" src={track.audioUrl} onContextMenu={(event) => event.preventDefault()} />
        </article>
      )}
    </main>
  )
}
