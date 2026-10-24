import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { config } from '../server/config.js';
import { voiceSystemPrompt, voiceTools } from '../shared/voice.js';

async function configure() {
  const publicUrl = new URL(process.argv[2] || process.env.VOICE_PUBLIC_URL || '');
  if (publicUrl.protocol !== 'https:')
    throw new Error('Eine öffentliche HTTPS-App-Adresse ist nötig.');
  if (!config.elevenLabsApiKey) throw new Error('ElevenLabs ist noch nicht angemeldet.');
  const client = new ElevenLabsClient();
  const secret = config.voiceLlmSecret || randomBytes(32).toString('hex');
  const save = (name: string, value: string) => {
    appendFileSync('.env', `\n${name}=${value}\n`, { mode: 0o600 });
    process.env[name] = value;
  };
  if (!config.voiceLlmSecret) save('VOICE_LLM_SECRET', secret);
  // These are provisioning requests; provider responses and credentials are never logged.
  async function provision(path: string, body: unknown) {
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/${path}`, {
      method: 'POST',
      headers: { 'xi-api-key': config.elevenLabsApiKey!, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(`ElevenLabs-Einrichtung fehlgeschlagen (${path}, HTTP ${response.status}).`);
    return response.json();
  }
  let secretId = process.env.ELEVENLABS_LLM_SECRET_ID;
  if (!secretId) {
    const result = await provision('secrets', {
      type: 'new',
      name: 'Pivot Gemma endpoint',
      value: secret,
    });
    secretId = result.secret_id;
    if (!secretId) throw new Error('ElevenLabs hat keine Secret-ID zurückgegeben.');
    save('ELEVENLABS_LLM_SECRET_ID', secretId);
  }
  let toolIds = process.env.ELEVENLABS_VOICE_TOOL_IDS?.split(',').filter(Boolean);
  if (!toolIds?.length) {
    toolIds = [];
    for (const tool of voiceTools) {
      const created = await provision('tools', {
        tool_config: {
          type: 'client',
          ...tool,
          expects_response: true,
          response_timeout_secs: tool.name === 'replan_day' ? 90 : 15,
          pre_tool_speech: tool.name === 'replan_day' ? 'force' : 'off',
          execution_mode: 'immediate',
          interruption_mode: tool.name === 'replan_day' ? 'disable_during_tool' : 'allow',
        },
      });
      if (!created.id) throw new Error('ElevenLabs hat keine Tool-ID zurückgegeben.');
      toolIds.push(created.id);
    }
    save('ELEVENLABS_VOICE_TOOL_IDS', toolIds.join(','));
  }
  const conversationConfig = {
    agent: {
      firstMessage: 'Hi, ich bin Pivot. Was hat sich an deinem Tag geändert?',
      language: 'de',
      prompt: {
        prompt: voiceSystemPrompt,
        llm: 'custom-llm' as const,
        temperature: 0.2,
        maxTokens: 2048,
        toolIds,
        enableParallelToolCalls: false,
        backupLlmConfig: { preference: 'disabled' as const },
        customLlm: {
          // ElevenLabs appends /chat/completions to this OpenAI-compatible base URL.
          url: `${publicUrl.origin}/api/voice/v1`,
          modelId: config.model,
          apiKey: { secretId },
          apiType: 'chat_completions' as const,
        },
      },
    },
    conversation: {
      maxDurationSeconds: 600,
      clientEvents: [
        'audio',
        'interruption',
        'user_transcript',
        'agent_response',
        'client_tool_call',
      ] as ('audio' | 'interruption' | 'user_transcript' | 'agent_response' | 'client_tool_call')[],
    },
    tts: {
      voiceId: process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL',
      modelId: 'eleven_flash_v2_5' as const,
    },
  };
  const platformSettings = { auth: { enableAuth: true } };
  let agentId = config.elevenLabsAgentId;
  if (agentId) {
    // An ID from another account must never silently fall back to a different LLM.
    await client.conversationalAi.agents.update(agentId, { conversationConfig, platformSettings });
  } else {
    const agent = await client.conversationalAi.agents.create({
      name: 'Pivot · Gemma Tagescopilot',
      conversationConfig,
      platformSettings,
    });
    agentId = agent.agentId;
    save('ELEVENLABS_AGENT_ID', agentId);
  }
  console.log(
    JSON.stringify({
      configured: true,
      agentId,
      endpoint: `${publicUrl.origin}/api/voice/v1/chat/completions`,
      tools: voiceTools.map((tool) => tool.name),
    }),
  );
}

configure().catch((error) => {
  // SDK errors may contain response/request metadata. Only emit our own safe errors.
  console.error(
    error instanceof Error && !('statusCode' in error)
      ? error.message
      : 'ElevenLabs konnte den Agenten nicht einrichten. Prüfe Konto und Berechtigungen.',
  );
  process.exitCode = 1;
});
