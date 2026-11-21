import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled Promise Rejection caught:', e.reason);
  e.preventDefault();
});

createRoot(document.getElementById('root')!).render(<App />);
