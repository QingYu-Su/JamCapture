import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ExtensionsPage } from './pages/ExtensionsPage'
import { LibraryPage } from './pages/LibraryPage'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/extensions" element={<ExtensionsPage />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Routes>
    </AppShell>
  )
}
