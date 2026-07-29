import { Disc3, Pause, Play, Sparkles, WandSparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'
import { usePlayer } from '../context/PlayerContext'
import type { GeneratedTrack } from '../types'
import { formatDate, formatDuration } from '../utils/format'
import { Waveform } from '../components/Waveform'

function GeneratedCard({ track, sourceNames }: { track: GeneratedTrack; sourceNames: string[] }) {
  const { current, playing, play } = usePlayer()
  const active = current?.id === track.id && playing
  return (
    <article className="generated-card">
      <div className="generated-number">AI / {track.id.slice(0, 4).toUpperCase()}</div>
      <div className="generated-top">
        <div className="generated-icon"><Disc3 size={22} /></div>
        <div><h3>{track.title}</h3><p>基于 {sourceNames.join('、') || `${track.sourceTrackIds.length} 段灵感`}</p></div>
        <span className="complete-badge"><i />READY</span>
      </div>
      <Waveform data={track.waveform} active={active} progress={active ? 0.46 : 0} className="generated-wave" />
      <p className="generated-prompt">“{track.prompt}”</p>
      <div className="generated-footer">
        <div className="generated-tags"><span>{track.mode === 'full' ? '完整作品' : '单乐器'}</span><span>{track.style}</span></div>
        <div className="generated-meta">{formatDate(track.createdAt)} · {formatDuration(track.duration)}</div>
        <button className="generated-play" onClick={() => void play(track)}>{active ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}<span>{active ? '暂停' : '播放作品'}</span></button>
      </div>
    </article>
  )
}

export function ExtensionsPage() {
  const { generated, inspirations, loading } = useLibrary()
  return (
    <div className="page extensions-page">
      <header className="page-header extension-header">
        <div><span className="eyebrow">CREATIVE WORKSPACE / 02</span><h1>灵感延伸</h1><p>让一个片段，长成一首完整的作品。</p></div>
        <div className="ai-status"><span><WandSparkles size={16} />AI ENGINE</span><strong>SIMULATION MODE</strong></div>
      </header>
      <div className="section-heading"><div><h2>生成作品</h2><span>{generated.length} DEMOS</span></div></div>
      <section className="generated-list">
        {loading ? <div className="loading-state"><span /><span /></div> : generated.length ? generated.map((track) => <GeneratedCard key={track.id} track={track} sourceNames={track.sourceTrackIds.map((id) => inspirations.find((item) => item.id === id)?.title).filter(Boolean) as string[]} />) : <div className="empty-state extension-empty"><Sparkles size={30} /><h3>还没有延伸作品</h3><p>从灵感库选择一段或多段录音，创建第一首 Demo。</p><Link to="/library">返回灵感库</Link></div>}
      </section>
    </div>
  )
}
