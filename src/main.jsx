import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App.jsx'

const isSecureContext = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

if (isSecureContext && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .catch((error) => console.error('ثبت سرویس‌ورکر آفلاین ناموفق بود:', error));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
