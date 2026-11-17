import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/eb-garamond';
import '@fontsource-variable/host-grotesk';
import './styles.css';
import App from './App';
import { StoreProvider } from './state';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
