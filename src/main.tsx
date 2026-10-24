import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import App from './App';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delay={300}>
      <ToastProvider position="top-center" timeout={4000}>
        <App />
      </ToastProvider>
    </TooltipProvider>
  </StrictMode>,
);
