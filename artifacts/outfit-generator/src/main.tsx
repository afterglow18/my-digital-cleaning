import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initializeRevenueCat } from './lib/revenuecat';

// Kick off RC configure() immediately at startup — before React mounts —
// so the SDK is ready (or has timed out gracefully) by the time any
// component calls getCustomerInfo() or getOfferings().
initializeRevenueCat().catch(console.warn);

// IndexedDB initialises lazily on first query — no explicit init needed here.
// All data is local; no API base URL or token setup required.

createRoot(document.getElementById('root')!).render(<App />);
