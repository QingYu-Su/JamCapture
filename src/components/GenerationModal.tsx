import { useEffect, useState } from 'react'
import { Check, Disc3, LoaderCircle, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'
import { optimizeLyricsPrompt } from '../services/murekaLyricsClient'
import type { InspirationTrack } from '../types'
import { Modal } from './Modal'

interface GenerationModalProps { tracks: InspirationTrack[]; open: boolean; onClose: () => void }

export function GenerationModal({ tracks, open, onClose }: GenerationModalProps) {
  const { generateDemo } = useLibrary()
  const navigate = useNavigate()
  const track = tracks[0]
  const isHumming = track?.recordingType === 'vocal' || track?.tags.instrument === '人声哼唱'
  const promptSuggestions = track?.aiAnalysis?.promptSuggestions ?? []
  const [prompt, setPrompt] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [lyricsExpanding, setLyricsExpanding] = useState(false)
  const [lyricsError, setLyricsError] = useState('')
  const [progress, setProgress] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setPrompt('')
      setLyrics('')
      setLyricsExpanding(false)
      setLyricsError('')
      setProgress(0)
      setGenerating(false)
      setComplete(false)
      setError('')
    }
  }, [isHumming, open, track?.id])

  async function submit() {
    if (!track) return
    setGenerating(true)
    setComplete(false)
    setError('')
    const interval = window.setInterval(() => setProgress((value) => Math.min(92, value + Math.random() * 14)), 260)
    try {
      await generateDemo({
        sourceTrackIds: [track.id],
        mode: 'full',
        generationKind: 'full-song',
        prompt: prompt.trim() || promptSuggestions[0]?.text || '保留原始旋律动机，自然发展为完整作品。',
        lyrics: lyrics.trim(),
        style: track.tags.style,
      })
      setProgress(100)
      setComplete(true)
    } catch (reason) {
      setProgress(0)
      setError(reason instanceof Error ? reason.message : '歌曲生成失败，请稍后重试')
    } finally {
      window.clearInterval(interval)
      setGenerating(false)
    }
  }

  async function handleExpandLyrics() {
    if (!lyrics.trim() || lyricsExpanding || generating) return
    setLyricsExpanding(true)
    setLyricsError('')
    try {
      setLyrics(await optimizeLyricsPrompt(lyrics))
    } catch (reason) {
      setLyricsError(reason instanceof Error ? reason.message : '歌词构思优化失败，请稍后重试')
    } finally {
      setLyricsExpanding(false)
    }
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
        <div className="field-label generation-lyrics-field">
          <span>创作风格与演绎要求 <small>{[...prompt].length}/180</small></span>
          <textarea aria-label="创作风格与演绎要求" value={prompt} maxLength={180} onChange={(event) => setPrompt(event.target.value)} placeholder="描述你想听见的走向、结构、情绪变化..." rows={4} />
        </div>
        <div className="field-label generation-lyrics-field">
            <span>歌词内容构思 <small>{[...lyrics].length}/180</small></span>
            <div className="generation-lyrics-input">
              <textarea aria-label="歌词内容构思" value={lyrics} maxLength={180} disabled={generating || lyricsExpanding} onChange={(event) => { setLyrics(event.target.value); setLyricsError('') }} placeholder="描述歌词主题、故事、人物视角、场景与情绪变化..." rows={7} />
              <button type="button" className="lyrics-expand-button" aria-label="AI 优化歌词构思" title="AI 优化歌词构思" disabled={!lyrics.trim() || lyricsExpanding || generating} onClick={() => void handleExpandLyrics()}>
                <Sparkles className={lyricsExpanding ? 'spin' : ''} size={17} />
              </button>
            </div>
            {lyricsError && <small className="lyrics-expand-error" role="alert">{lyricsError}</small>}
        </div>
        {!isHumming && <div>
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
        </div>}
        {generating && <div className="generation-progress"><div><LoaderCircle className="spin" size={17} /><span>正在分析并构建 Demo</span><strong>{Math.round(progress)}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>}
        {error && <div className="generation-error" role="alert">{error}</div>}
        {complete && <div className="generation-complete"><Check size={18} /><span>Demo 已生成并保存到灵感延伸</span></div>}
        <div className="dialog-footer generation-footer">
          {complete ? <button className="primary-button" onClick={() => { onClose(); navigate('/extensions') }}>查看生成作品</button> : <button className="primary-button wide" disabled={generating} onClick={() => void submit()}>{generating ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}生成 Demo</button>}
        </div>
      </section>
    </Modal>
  )
}
