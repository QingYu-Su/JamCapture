import { useEffect, useState } from 'react'
import { Check, Disc3, LoaderCircle, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'
import type { InspirationTrack } from '../types'
import { Modal } from './Modal'

interface GenerationModalProps { tracks: InspirationTrack[]; open: boolean; onClose: () => void }

export function GenerationModal({ tracks, open, onClose }: GenerationModalProps) {
  const { generateDemo } = useLibrary()
  const navigate = useNavigate()
  const track = tracks[0]
  const promptSuggestions = track?.aiAnalysis?.promptSuggestions ?? []
  const [prompt, setPrompt] = useState('')
  const [progress, setProgress] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    if (open) {
      setPrompt('')
      setProgress(0)
      setGenerating(false)
      setComplete(false)
    }
  }, [open, track?.id])

  async function submit() {
    if (!track) return
    setGenerating(true)
    setComplete(false)
    const interval = window.setInterval(() => setProgress((value) => Math.min(92, value + Math.random() * 14)), 260)
    await generateDemo({
      sourceTrackIds: [track.id],
      mode: 'full',
      prompt: prompt.trim() || promptSuggestions[0]?.text || '保留原始旋律动机，自然发展为完整作品。',
      style: track.tags.style,
    })
    window.clearInterval(interval)
    setProgress(100)
    setGenerating(false)
    setComplete(true)
  }

  return (
    <Modal open={open} onOpenChange={(next) => !next && !generating && onClose()} title="灵感延伸" description="基于当前灵感继续创作" size="lg">
      <section className="generation-settings generation-settings-single">
        {track && (
          <div className="selected-source">
            <div><Disc3 size={18} /></div>
            <span><small>当前所选歌曲</small><strong>{track.title}</strong></span>
            <em>{track.tags.instrument}</em>
          </div>
        )}
        <label className="field-label">创作意图<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述你想听见的走向、结构、情绪变化..." rows={4} /></label>
        <div>
          <span className="field-caption">AI Prompt 建议</span>
          <div className="prompt-suggestions">
            {promptSuggestions.map((suggestion, index) => (
              <button key={`${suggestion.title}-${index}`} onClick={() => setPrompt(suggestion.text)}>
                <span>0{index + 1}</span>
                <div><strong>{suggestion.title}</strong><p>{suggestion.text}</p></div>
              </button>
            ))}
            {!promptSuggestions.length && (
              <div className="prompt-suggestions-empty">
                <LoaderCircle className={track?.aiAnalysis?.status === 'analyzing' ? 'spin' : ''} size={15} />
                <span>{track?.aiAnalysis?.status === 'analyzing' ? '正在生成这首歌曲的专属建议' : '这首歌曲暂时没有可用的 Prompt 建议'}</span>
              </div>
            )}
          </div>
        </div>
        {generating && <div className="generation-progress"><div><LoaderCircle className="spin" size={17} /><span>正在分析并构建 Demo</span><strong>{Math.round(progress)}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>}
        {complete && <div className="generation-complete"><Check size={18} /><span>Demo 已生成并保存到灵感延伸</span></div>}
        <div className="dialog-footer generation-footer">
          {complete ? <button className="primary-button" onClick={() => { onClose(); navigate('/extensions') }}>查看生成作品</button> : <button className="primary-button wide" disabled={generating} onClick={() => void submit()}>{generating ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}生成 Demo</button>}
        </div>
      </section>
    </Modal>
  )
}
