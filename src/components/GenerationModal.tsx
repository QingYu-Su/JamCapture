import * as Tabs from '@radix-ui/react-tabs'
import { useEffect, useState } from 'react'
import { AudioLines, Check, Disc3, Guitar, LoaderCircle, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'
import type { GenerationMode, InspirationTrack } from '../types'
import { Modal } from './Modal'

const styles = ['Alternative Rock', 'Neo Soul', 'Dream Pop', 'Cinematic', 'Lo-fi Tape']
const promptSuggestions = [
  { title: '延续旋律动机', text: '保留原始旋律和演奏触感，逐步增加和声层次，并发展出自然的主歌与副歌。' },
  { title: '制造情绪转折', text: '从克制、留白的开场出发，在中段加入更强的鼓组与动态，最后回到简洁的主题。' },
  { title: '重构为完整 Demo', text: '提取片段中的核心节奏和和弦走向，扩展为具有前奏、主歌、副歌和尾奏的完整结构。' },
]

interface GenerationModalProps { tracks: InspirationTrack[]; open: boolean; onClose: () => void }

export function GenerationModal({ tracks, open, onClose }: GenerationModalProps) {
  const { generateDemo } = useLibrary()
  const navigate = useNavigate()
  const [mode, setMode] = useState<GenerationMode>('instrument')
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState(styles[0])
  const [progress, setProgress] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [complete, setComplete] = useState(false)
  useEffect(() => { if (open) { setProgress(0); setGenerating(false); setComplete(false) } }, [open])
  async function submit() {
    setGenerating(true); setComplete(false)
    const interval = window.setInterval(() => setProgress((value) => Math.min(92, value + Math.random() * 14)), 260)
    await generateDemo({ sourceTrackIds: tracks.map((track) => track.id), mode, prompt: prompt.trim() || '保留原始旋律动机，自然发展结构与动态。', style })
    window.clearInterval(interval); setProgress(100); setGenerating(false); setComplete(true)
  }

  return (
    <Modal open={open} onOpenChange={(next) => !next && !generating && onClose()} title="灵感延伸" description={`${tracks.length} 段灵感将作为同一个创作上下文`} size="lg">
      <div className="generation-layout">
        <section className="source-panel">
          <span className="eyebrow">SOURCE MATERIAL</span>
          <div className="source-list">{tracks.map((track, index) => <div key={track.id}><span>{String(index + 1).padStart(2, '0')}</span><strong>{track.title}</strong><small>{track.tags.instrument}</small></div>)}</div>
          <div className="source-note"><AudioLines size={17} /><span>AI 将识别和声、节奏与演奏动态</span></div>
        </section>
        <section className="generation-settings">
          <Tabs.Root value={mode} onValueChange={(value) => setMode(value as GenerationMode)}>
            <Tabs.List className="mode-tabs">
              <Tabs.Trigger value="instrument"><Guitar size={17} /><span>单乐器延伸</span></Tabs.Trigger>
              <Tabs.Trigger value="full"><Disc3 size={17} /><span>完整作品延伸</span></Tabs.Trigger>
            </Tabs.List>
          </Tabs.Root>
          <label className="field-label">创作意图<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述你想听见的走向、结构、情绪变化..." rows={4} /></label>
          <div>
            <span className="field-caption">AI Prompt 建议</span>
            <div className="prompt-suggestions">
              {promptSuggestions.map((suggestion, index) => (
                <button key={suggestion.title} onClick={() => setPrompt(suggestion.text)}>
                  <span>0{index + 1}</span>
                  <div><strong>{suggestion.title}</strong><p>{suggestion.text}</p></div>
                </button>
              ))}
            </div>
          </div>
          <div><span className="field-caption">AI 推荐风格</span><div className="style-chips">{styles.map((item) => <button key={item} className={style === item ? 'active' : ''} onClick={() => setStyle(item)}>{item}</button>)}</div></div>
          {generating && <div className="generation-progress"><div><LoaderCircle className="spin" size={17} /><span>正在分析并构建 Demo</span><strong>{Math.round(progress)}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>}
          {complete && <div className="generation-complete"><Check size={18} /><span>Demo 已生成并保存到灵感延伸</span></div>}
          <div className="dialog-footer generation-footer">
            {complete ? <button className="primary-button" onClick={() => { onClose(); navigate('/extensions') }}>查看生成作品</button> : <button className="primary-button wide" disabled={generating} onClick={() => void submit()}>{generating ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}生成 Demo</button>}
          </div>
        </section>
      </div>
    </Modal>
  )
}
