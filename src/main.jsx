import { StrictMode, useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App.jsx'
import AccessGate from './domains/auth/AccessGate.jsx'
import SeemulatorLanding from './components/SeemulatorLanding.jsx'

function Root() {
  const [entered, setEntered] = useState(false)
  const handleUnlock = useCallback(() => setEntered(true), [])

  if (!entered) {
    return <SeemulatorLanding onUnlock={handleUnlock} />
  }

  return (
    <AccessGate>
      <App />
    </AccessGate>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
