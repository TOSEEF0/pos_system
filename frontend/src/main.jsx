import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Prevent accidental Ctrl + MouseWheel zooming in desktop POS
window.addEventListener(
  'wheel',
  (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
    }
  },
  { passive: false }
);

// Global keyboard shortcuts for zoom reset (Ctrl+0), zoom in (Ctrl+=), zoom out (Ctrl+-)
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.altKey && !e.metaKey) {
    if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
      e.preventDefault();
      if (window.api?.zoomReset) {
        window.api.zoomReset();
      }
    } else if (e.key === '=' || e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd') {
      e.preventDefault();
      if (window.api?.zoomIn) {
        window.api.zoomIn();
      }
    } else if (e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
      e.preventDefault();
      if (window.api?.zoomOut) {
        window.api.zoomOut();
      }
    }
  }
});

createRoot(document.getElementById('root')).render(
  <App />
)

