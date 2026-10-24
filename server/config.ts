import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

const onboardEnv = resolve('.env.local');
if (existsSync(onboardEnv)) loadEnvFile(onboardEnv);
const localEnv = resolve('.env');
if (existsSync(localEnv)) loadEnvFile(localEnv);

export function readApiKey(): string | undefined {
  const direct =
    process.env.GEMMA_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (direct) return direct;
  if (!process.env.GEMMA_KEY_FILE) return undefined;
  try {
    const source = readFileSync(process.env.GEMMA_KEY_FILE, 'utf8');
    const assigned = source.match(
      /(?:GEMMA_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY)\s*[:=]\s*["'`]?([^\s"'`]+)/i,
    )?.[1];
    const tokens = source.match(/[A-Za-z0-9_.-]{30,}/g) ?? [];
    return assigned || (tokens.length === 1 ? tokens[0] : undefined);
  } catch {
    return undefined;
  }
}

export const config = {
  apiKey: readApiKey(),
  model: process.env.GEMMA_MODEL || 'gemma-4-26b-a4b-it',
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
  elevenLabsAgentId: process.env.ELEVENLABS_AGENT_ID,
  voiceLlmSecret: process.env.VOICE_LLM_SECRET,
  port: Number(process.env.PORT || 3000),
  allowedHosts: [
    'localhost',
    '127.0.0.1',
    ...[
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
      process.env.APP_HOSTS,
    ]
      .filter((value): value is string => Boolean(value))
      .flatMap((value) =>
        value
          .split(',')
          .map((host) => host.trim())
          .filter(Boolean),
      ),
  ],
};
