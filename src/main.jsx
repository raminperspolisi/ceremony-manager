import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './design-tokens.css'
import './index.css'
import './App.css'
import './components/shared-components.css'
import App from './App.jsx'
import { ToastProvider } from './components/ToastProvider.jsx'

const isSecureContext = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

if (isSecureContext && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    .catch((error) => console.error('ثبت سرویس‌ورکر آفلاین ناموفق بود:', error));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
