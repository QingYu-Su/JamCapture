import { CalendarDays, ChevronDown, RotateCcw, Search, SlidersHorizontal } from 'lucide-react'
import type { InspirationTrack, TrackFilters } from '../types'
import { uniqueTagValues } from '../utils/tracks'

interface FilterBarProps {
  tracks: InspirationTrack[]
  filters: TrackFilters
  onChange: (filters: TrackFilters) => void
}

export function FilterBar({ tracks, filters, onChange }: FilterBarProps) {
  const hasFilters = filters.query || filters.instrument !== 'all' || filters.style !== 'all' || filters.date !== 'all'
  return (
    <div className="filter-bar">
      <label className="search-field">
        <Search size={18} />
        <input value={filters.query} onChange={(event) => onChange({ ...filters, query: event.target.value })} placeholder="搜索标题、标签或乐器..." />
        <kbd>⌘ K</kbd>
      </label>
      <div className="filter-group">
        <label className="select-field"><SlidersHorizontal size={16} /><select value={filters.style} onChange={(event) => onChange({ ...filters, style: event.target.value })}><option value="all">全部风格</option>{uniqueTagValues(tracks, 'style').map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={14} /></label>
        <label className="select-field"><select value={filters.instrument} onChange={(event) => onChange({ ...filters, instrument: event.target.value })}><option value="all">全部乐器</option>{uniqueTagValues(tracks, 'instrument').map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={14} /></label>
        <label className="select-field"><CalendarDays size={16} /><select value={filters.date} onChange={(event) => onChange({ ...filters, date: event.target.value as TrackFilters['date'] })}><option value="all">全部日期</option><option value="week">最近 7 天</option><option value="month">最近 30 天</option><option value="older">更早</option></select><ChevronDown size={14} /></label>
        {hasFilters && <button className="reset-filter" onClick={() => onChange({ query: '', instrument: 'all', style: 'all', date: 'all' })}><RotateCcw size={15} />重置</button>}
      </div>
    </div>
  )
}
