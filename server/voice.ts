import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { PlannerError } from './gemma.js';
import { conversationRequestSchema, streamGemmaConversation } from './gemma-conversation.js';

export type VoiceOptions = {
  apiKey?: string;
  model: string;
  fetcher?: typeof fetch;
  elevenLabsApiKey?: string;
  elevenLabsAgentId?: string;
  voiceLlmSecret?: string;
  sessionSigner?: (agentId: string) => Promise<string>;
};

export function hasVoiceAuthorization(header: string | undefined, secret: string | undefined) {
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const actual = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createConversationRouter(options: VoiceOptions) {
  const router = Router();
  let active = 0;
  router.post('/v1/chat/completions', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!hasVoiceAuthorization(req.headers.authorization, options.voiceLlmSecret))
      return res.status(401).json({ error: 'Nicht autorisierte Sprachanfrage.' });
    const parsed = conversationRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Ungültiges Gesprächsformat.' });
    if (active >= 4) return res.status(429).json({ error: 'Bitte versuche es gleich erneut.' });
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    active++;
    try {
      for await (const chunk of streamGemmaConversation(parsed.data, options, controller.signal)) {
        if (controller.signal.aborted) break;
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('X-Accel-Buffering', 'no');
        }
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      if (!controller.signal.aborted) res.end('data: [DONE]\n\n');
    } catch (error) {
      if (controller.signal.aborted) return;
      const message =
        error instanceof PlannerError
          ? error.message
          : 'Der Sprachdialog ist gerade nicht erreichbar.';
      if (!res.headersSent)
        res.status(error instanceof PlannerError ? error.status : 502).json({ error: message });
      else res.end(`data: ${JSON.stringify({ error: { message } })}\n\ndata: [DONE]\n\n`);
    } finally {
      active--;
    }
  });
  return router;
}

export function createVoiceRouter(options: VoiceOptions) {
  const router = Router();
  const configured = Boolean(
    options.apiKey &&
    options.elevenLabsApiKey &&
    options.elevenLabsAgentId &&
    options.voiceLlmSecret,
  );
  router.get('/status', (_req, res) => res.json({ configured }));
  router.post('/session', async (_req, res) => {
    if (!configured)
      return res.status(503).json({ error: 'Der Sprachdialog ist noch nicht eingerichtet.' });
    try {
      const signedUrl = options.sessionSigner
        ? await options.sessionSigner(options.elevenLabsAgentId!)
        : (
            await new ElevenLabsClient({
              apiKey: options.elevenLabsApiKey,
            }).conversationalAi.conversations.getSignedUrl({ agentId: options.elevenLabsAgentId! })
          ).signedUrl;
      if (!signedUrl?.startsWith('wss://api.elevenlabs.io/'))
        throw new Error('Invalid session URL');
      return res.json({ signedUrl });
    } catch {
      return res.status(502).json({
        error:
          'Die Sprachverbindung konnte nicht gestartet werden. Prüfe die ElevenLabs-Einrichtung.',
      });
    }
  });
  return router;
}
