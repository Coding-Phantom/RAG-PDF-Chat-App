import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { isLoggedIn } from './api'
import AuthScreen from './pages/AuthScreen'
import Dashboard from './pages/Dashboard'

function Root() {
  if (!isLoggedIn()) {
    return <AuthScreen />
  }

  return <Dashboard />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
