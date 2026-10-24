import express from 'express';
import { extractRequestSchema, replanRequestSchema, validatePlan } from '../shared/contracts.js';
import { extractTasks } from './extract.js';
import { generatePlan, PlannerError } from './gemma.js';
import { isAllowedRequest } from './request-origin.js';
import { getVersions } from './versions.js';

export function createApp(options: {
  apiKey?: string;
  model: string;
  fetcher?: typeof fetch;
  allowedHosts?: string[];
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const host = req.headers.host;
    if (
      !isAllowedRequest(
        host,
        req.headers.origin,
        options.allowedHosts ?? ['localhost', '127.0.0.1'],
      )
    )
      return res
        .status(403)
        .json({ error: 'Diese Anfrage kommt nicht aus einer freigegebenen App-Adresse.' });
    next();
  });
  app.post('/api/extract', express.json({ limit: '4mb' }), async (req, res) => {
    const parsed = extractRequestSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: 'Das Bild ist ungültig oder zu groß. Nutze PNG, JPEG oder WebP bis etwa 2,5 MB.',
      });
    if (activeExtractions >= 2)
      return res
        .status(429)
        .json({ error: 'Es werden gerade zwei Bilder gelesen. Versuche es gleich erneut.' });
    activeExtractions++;
    try {
      return res.json(await extractTasks(parsed.data, options));
    } catch (error) {
      return res.status(error instanceof PlannerError ? error.status : 500).json({
        error:
          error instanceof PlannerError
            ? error.message
            : 'Das Bild konnte nicht gelesen werden. Versuche es erneut.',
      });
    } finally {
      activeExtractions--;
    }
  });
  app.use(express.json({ limit: '64kb' }));
  app.get('/api/health', (_req, res) =>
    res.json({ configured: Boolean(options.apiKey), model: options.model }),
  );
  app.get('/api/versions', async (_req, res) => res.json(await getVersions()));
  let activeRequests = 0;
  let activeExtractions = 0;
  app.post('/api/replan', async (req, res) => {
    const parsed = replanRequestSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: 'Die Eingaben sind ungültig. Prüfe Aufgaben und Check-in.' });
    const issues = validatePlan(parsed.data.plan);
    if (issues.length) return res.status(400).json({ error: issues.join(' ') });
    if (activeRequests >= 2)
      return res
        .status(429)
        .json({ error: 'Es werden gerade zwei Pläne berechnet. Versuche es gleich erneut.' });
    activeRequests++;
    try {
      return res.json(await generatePlan(parsed.data, options));
    } catch (error) {
      return res.status(error instanceof PlannerError ? error.status : 500).json({
        error:
          error instanceof PlannerError
            ? error.message
            : 'Der Plan konnte nicht erstellt werden. Versuche es erneut.',
      });
    } finally {
      activeRequests--;
    }
  });
  app.use('/api', (_req, res) =>
    res.status(404).json({ error: 'Diesen API-Endpunkt gibt es nicht.' }),
  );
  app.use(
    (
      error: { status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(error.status === 413 ? 413 : 400).json({
        error:
          error.status === 413
            ? 'Die Anfrage ist zu groß.'
            : 'Die Anfrage enthält kein gültiges JSON.',
      });
    },
  );
  return app;
}
