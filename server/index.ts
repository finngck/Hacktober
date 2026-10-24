import express from 'express';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp(config);
if (process.argv.includes('--production')) {
  app.use(express.static(resolve('dist')));
  app.get(['/app', '/app/{*path}'], (_req, res) => res.sendFile(resolve('dist/app.html')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.get(['/app', '/app/{*path}'], (req, _res, next) => {
    req.url = '/app.html';
    next();
  });
  app.use(vite.middlewares);
}
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`Pivot is running at http://localhost:${config.port}`);
  console.log(
    config.apiKey
      ? `Gemma configured: ${config.model}`
      : 'Gemma key missing. For setup, see README.md.',
  );
});
server.on('error', () => {
  console.error("The local server couldn't start. Check whether the port is already in use.");
  process.exit(1);
});
