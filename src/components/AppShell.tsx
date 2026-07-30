import { AudioLines, Library, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { PlayerBar } from './PlayerBar'
import { FullscreenPlayer } from './FullscreenPlayer'
import { cn } from '../utils/format'

const navigation = [
  { to: '/library', label: '我的灵感库', icon: Library },
  { to: '/extensions', label: '灵感延伸', icon: Sparkles },
]

function Navigation({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav className={cn('nav-list', mobile && 'mobile-nav-list')} aria-label="主导航">
      {navigation.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => cn('nav-item', isActive && 'nav-item-active')}>
          <Icon size={19} strokeWidth={1.8} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [playerOpen, setPlayerOpen] = useState(false)
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><AudioLines size={22} /></span><span>JamCapture</span></div>
        <Navigation />
      </aside>
      <main className="main-content">{children}</main>
      <PlayerBar onExpand={() => setPlayerOpen(true)} />
      <FullscreenPlayer open={playerOpen} onClose={() => setPlayerOpen(false)} />
      <div className="mobile-nav"><Navigation mobile /></div>
    </div>
  )
}
