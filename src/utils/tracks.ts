import type { InspirationTrack, TrackFilters } from '../types'

export function filterTracks(tracks: InspirationTrack[], filters: TrackFilters, now = new Date()) {
  const query = filters.query.trim().toLocaleLowerCase()
  return tracks.filter((track) => {
    const searchText = [track.title, ...Object.values(track.tags)].join(' ').toLocaleLowerCase()
    if (query && !searchText.includes(query)) return false
    if (filters.instrument !== 'all' && track.tags.instrument !== filters.instrument) return false
    if (filters.style !== 'all' && track.tags.style !== filters.style) return false

    if (filters.date !== 'all') {
      const age = now.getTime() - Date.parse(track.recordedAt)
      const days = age / 86_400_000
      if (filters.date === 'week' && days > 7) return false
      if (filters.date === 'month' && days > 30) return false
      if (filters.date === 'older' && days <= 30) return false
    }
    return true
  })
}

export function uniqueTagValues(tracks: InspirationTrack[], kind: 'style' | 'instrument') {
  return [...new Set(tracks.map((track) => track.tags[kind]))].sort()
}
