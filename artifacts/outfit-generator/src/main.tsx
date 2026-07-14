import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// IndexedDB initialises lazily on first query — no explicit init needed here.
// All data is local; no API base URL or token setup required.

createRoot(document.getElementById('root')!).render(<App />);
