import { initApiClient } from '@bookdock/api-client';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Initialize API Client for both Web and Desktop
initApiClient({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8088/api',
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
