import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { getBuildInfo } from './server/build-info.ts';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: { __BUILD_INFO__: JSON.stringify(getBuildInfo()) },
  build: { rollupOptions: { input: { landing: 'index.html', app: 'app.html' } } },
  server: { allowedHosts: ['localhost', '127.0.0.1'] },
});
