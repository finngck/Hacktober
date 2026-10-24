import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { getBuildInfo } from './server/build-info.ts';

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_INFO__: JSON.stringify(getBuildInfo()) },
  server: { allowedHosts: ['localhost', '127.0.0.1'] },
});
