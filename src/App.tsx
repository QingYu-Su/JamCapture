import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LibraryProvider } from './context/LibraryContext'
import { PlayerProvider } from './context/PlayerContext'
import { ExtensionsPage } from './pages/ExtensionsPage'
import { LibraryPage } from './pages/LibraryPage'
import { SharePage } from './pages/SharePage'

export default function App() {
  const location = useLocation()
  if (location.pathname.startsWith('/share/')) {
    return <Routes><Route path="/share/:token" element={<SharePage />} /><Route path="*" element={<Navigate to="/library" replace />} /></Routes>
  }
  return (
    <LibraryProvider>
      <PlayerProvider>
        <AppShell>
          <Routes>
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/extensions" element={<ExtensionsPage />} />
            <Route path="*" element={<Navigate to="/library" replace />} />
          </Routes>
        </AppShell>
      </PlayerProvider>
    </LibraryProvider>
  )
}
