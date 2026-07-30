import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RecordingTypeModal } from './RecordingTypeModal'

describe('RecordingTypeModal', () => {
  it.each([
    ['录制乐器灵感', 'instrument'],
    ['录制哼唱灵感', 'vocal'],
  ] as const)('selects %s before recording starts', (label, type) => {
    const onSelect = vi.fn()

    render(<RecordingTypeModal open onClose={vi.fn()} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }))

    expect(onSelect).toHaveBeenCalledWith(type)
  })
})
