import { initApiClient } from '@bookdock/api-client';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { getSavedApiBaseUrl } from './utils/network';

// Initialize API Client for both Web and Desktop
initApiClient({
  baseURL: getSavedApiBaseUrl(import.meta.env.VITE_API_BASE_URL || 'http://localhost:8088/api'),
  getAuthToken: () => localStorage.getItem('bookdock_auth_token'),
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
