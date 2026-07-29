import { describe, expect, it } from 'vitest'
import { demoTracks } from '../data/demoTracks'
import { filterTracks, uniqueTagValues } from './tracks'

describe('track filtering', () => {
  const base = { query: '', instrument: 'all', style: 'all', date: 'all' } as const

  it('searches title and semantic tags without case sensitivity', () => {
    expect(filterTracks(demoTracks, { ...base, query: 'electric' })).toHaveLength(1)
    expect(filterTracks(demoTracks, { ...base, query: 'SUNDAY' })[0]?.id).toBe('demo-sunday-chords')
  })

  it('combines style and instrument filters', () => {
    const result = filterTracks(demoTracks, { ...base, style: 'Neo Soul', instrument: 'Acoustic Guitar' })
    expect(result.map((track) => track.title)).toEqual(['Sunday Window Chords'])
  })

  it('returns stable unique filter values', () => {
    expect(uniqueTagValues(demoTracks, 'instrument')).toEqual(['Acoustic Guitar', 'Bass', 'Electric Guitar'])
  })
})
