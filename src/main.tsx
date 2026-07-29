import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { LibraryProvider } from './context/LibraryContext'
import { PlayerProvider } from './context/PlayerContext'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LibraryProvider>
        <PlayerProvider>
          <App />
        </PlayerProvider>
      </LibraryProvider>
    </BrowserRouter>
  </StrictMode>,
)
