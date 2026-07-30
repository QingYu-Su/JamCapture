import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Mic, Pause, Play, Square } from 'lucide-react'
import type { InspirationTrack, RecordingType } from '../types'
import { analyzeAudioBlob, waveformFromSamples } from '../utils/audio'
import { formatDuration } from '../utils/format'
import { Modal } from './Modal'
import { Waveform } from './Waveform'

type RecordingState = 'requesting' | 'recording' | 'paused' | 'processing' | 'error'

interface RecordingModalProps {
  recordingType: RecordingType
  open: boolean
  onClose: () => void
  onSave: (track: InspirationTrack, blob: Blob) => Promise<void>
}

export function RecordingModal({ recordingType, open, onClose, onSave }: RecordingModalProps) {
  const [status, setStatus] = useState<RecordingState>('requesting')
  const [seconds, setSeconds] = useState(0)
  const [waveform, setWaveform] = useState<number[]>(Array(48).fill(18))
  const [error, setError] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const animationRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  const cleanup = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void audioContextRef.current?.close()
    audioContextRef.current = null
  }, [])

  useEffect(() => {
    if (!open) { cleanup(); return }
    let cancelled = false
    setStatus('requesting'); setSeconds(0); setError(''); chunksRef.current = []

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        setStatus('error'); setError('当前浏览器不支持录音，请使用最新版 Chrome、Edge 或 Safari。'); return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return }
        streamRef.current = stream
        const preferredMimeType = [
          'audio/mp4;codecs=mp4a.40.2',
          'audio/mp4',
          'audio/webm;codecs=opus',
        ].find((type) => MediaRecorder.isTypeSupported(type))
        // Prefer M4A-compatible recording so the completed file can be sent directly to Mureka.
        const recorder = new MediaRecorder(stream, preferredMimeType ? { mimeType: preferredMimeType } : undefined)
        recorderRef.current = recorder
        recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
        recorder.start(250)
        setStatus('recording')

        const context = new AudioContext()
        audioContextRef.current = context
        const analyser = context.createAnalyser()
        analyser.fftSize = 256
        context.createMediaStreamSource(stream).connect(analyser)
        const values = new Uint8Array(analyser.frequencyBinCount)
        const draw = () => {
          analyser.getByteTimeDomainData(values)
          setWaveform(waveformFromSamples(values, 48))
          animationRef.current = requestAnimationFrame(draw)
        }
        draw()
      } catch (reason) {
        setStatus('error')
        setError(reason instanceof DOMException && reason.name === 'NotAllowedError' ? '麦克风权限被拒绝。请在浏览器设置中允许访问后重试。' : '无法启动录音设备，请检查麦克风连接。')
      }
    }
    void start()
    return () => { cancelled = true; cleanup() }
  }, [cleanup, open])

  useEffect(() => {
    if (!open || status !== 'recording') return
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(interval)
  }, [open, status])

  function togglePause() {
    const recorder = recorderRef.current
    if (!recorder) return
    if (recorder.state === 'recording') { recorder.pause(); setStatus('paused') }
    else if (recorder.state === 'paused') { recorder.resume(); setStatus('recording') }
  }

  async function finish() {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    const blob = await new Promise<Blob>((resolve) => {
      recorder.addEventListener('stop', () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })), { once: true })
      recorder.stop()
    })
    setStatus('processing')
    let completeWaveform = waveform
    let completeDuration = Math.max(1, seconds)
    try {
      // Analyze the completed take so the card waveform represents the entire recording.
      const analysis = await analyzeAudioBlob(blob)
      completeWaveform = analysis.waveform
      completeDuration = analysis.duration
    } catch {
      // A few WebKit versions cannot immediately decode their MediaRecorder container.
      // Keeping the live preview preserves a useful waveform instead of blocking the save.
    }
    const id = crypto.randomUUID()
    const track: InspirationTrack = {
      id, kind: 'inspiration', title: `New Capture ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`,
      audioSource: { type: 'blob', blobId: id }, waveform: completeWaveform, waveformVersion: 2, tags: { style: 'Unsorted', instrument: 'Guitar', mood: 'Raw', bpm: '— BPM' },
      recordedAt: new Date().toISOString(), duration: completeDuration,
      recordingType,
    }
    cleanup()
    await onSave(track, blob)
    onClose()
  }

  return (
    <Modal open={open} onOpenChange={(next) => !next && onClose()} title="捕捉这一刻" description="原始录音只会保存在当前设备。" size="sm">
      <div className="record-panel">
        {status === 'error' ? <div className="record-error"><AlertCircle size={28} /><strong>无法开始录音</strong><p>{error}</p></div> : <>
          <div className="record-status"><span className={status === 'recording' ? 'record-dot' : 'record-dot paused'} /><span>{status === 'requesting' ? '正在请求麦克风...' : status === 'paused' ? '录音已暂停' : status === 'processing' ? '正在生成音频波形...' : '正在录制'}</span></div>
          <div className="record-time">{formatDuration(seconds)}</div>
          <Waveform data={waveform} active={status === 'recording'} className="record-wave" />
          <div className="record-hint"><Mic size={15} />保持 15–30 cm 距离，获得更清晰的动态</div>
          <div className="record-controls">
            <button className="record-secondary" disabled={status === 'requesting' || status === 'processing'} onClick={togglePause}>{status === 'paused' ? <Play size={19} fill="currentColor" /> : <Pause size={19} fill="currentColor" />}<span>{status === 'paused' ? '继续' : '暂停'}</span></button>
            <button className="record-finish" disabled={status === 'requesting' || status === 'processing'} onClick={() => void finish()}><Square size={18} fill="currentColor" /><span>{status === 'processing' ? '处理中' : '完成录制'}</span></button>
          </div>
        </>}
      </div>
    </Modal>
  )
}
