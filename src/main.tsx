import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/eb-garamond';
import '@fontsource-variable/host-grotesk';
import './styles.css';
import App from './App';
import { StoreProvider } from './state';
import { SyncProvider } from './sync';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <SyncProvider>
        <App />
      </SyncProvider>
    </StoreProvider>
  </StrictMode>,
);
