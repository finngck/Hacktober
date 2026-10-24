import express from 'express';
import { extractRequestSchema, replanRequestSchema, validatePlan } from '../shared/contracts.js';
import { extractTasks } from './extract.js';
import { generatePlan, PlannerError } from './gemma.js';
import { isAllowedRequest } from './request-origin.js';
import { getVersions } from './versions.js';
import { createConversationRouter, createVoiceRouter, type VoiceOptions } from './voice.js';

export function createApp(
  options: VoiceOptions & {
    allowedHosts?: string[];
  },
) {
  const app = express();
  app.disable('x-powered-by');
  // ElevenLabs calls this server-to-server endpoint with its own bearer secret.
  app.use('/api/voice', express.json({ limit: '512kb' }), createConversationRouter(options));
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
        .json({ error: "This request doesn't come from an allowed app address." });
    next();
  });
  app.use('/api/voice', createVoiceRouter(options));
  let activeExtractions = 0;
  app.post('/api/extract', express.json({ limit: '4mb' }), async (req, res) => {
    const parsed = extractRequestSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: 'The image is invalid or too large. Use PNG, JPEG or WebP up to about 2.5 MB.',
      });
    if (activeExtractions >= 2)
      return res
        .status(429)
        .json({ error: 'Two images are already being read. Try again in a moment.' });
    activeExtractions++;
    try {
      return res.json(await extractTasks(parsed.data, options));
    } catch (error) {
      return res.status(error instanceof PlannerError ? error.status : 500).json({
        error:
          error instanceof PlannerError ? error.message : "The image couldn't be read. Try again.",
      });
    } finally {
      activeExtractions--;
    }
  });
  app.get('/api/health', (_req, res) =>
    res.json({ configured: Boolean(options.apiKey), model: options.model }),
  );
  app.get('/api/versions', async (_req, res) => res.json(await getVersions()));
  let activeRequests = 0;
  app.post('/api/replan', express.json({ limit: '64kb' }), async (req, res) => {
    const parsed = replanRequestSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: 'The input is invalid. Check your tasks and check-in.' });
    const issues = validatePlan(parsed.data.plan);
    if (issues.length) return res.status(400).json({ error: issues.join(' ') });
    if (activeRequests >= 2)
      return res
        .status(429)
        .json({ error: 'Two plans are already being calculated. Try again in a moment.' });
    activeRequests++;
    try {
      return res.json(await generatePlan(parsed.data, options));
    } catch (error) {
      return res.status(error instanceof PlannerError ? error.status : 500).json({
        error:
          error instanceof PlannerError
            ? error.message
            : "The plan couldn't be created. Try again.",
      });
    } finally {
      activeRequests--;
    }
  });
  app.use('/api', (_req, res) =>
    res.status(404).json({ error: "This API endpoint doesn't exist." }),
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
            ? 'The request is too large.'
            : "The request doesn't contain valid JSON.",
      });
    },
  );
  return app;
}
