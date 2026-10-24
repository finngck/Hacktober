import express from 'express';
import { resolve } from 'node:path';
import { createApp } from './app';
import { config } from './config';

const app = createApp(config);
if (process.argv.includes('--production')) {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`Daylight läuft auf http://localhost:${config.port}`);
  console.log(
    config.apiKey
      ? `Gemma konfiguriert: ${config.model}`
      : 'Gemma-Key fehlt. Konfiguration: siehe README.md.',
  );
});
server.on('error', () => {
  console.error('Der lokale Server konnte nicht starten. Prüfe, ob der Port bereits belegt ist.');
  process.exit(1);
});
