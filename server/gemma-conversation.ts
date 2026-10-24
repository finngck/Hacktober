import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  voiceSystemPrompt,
  voiceToolArguments,
  voiceTools,
  type VoiceToolName,
} from '../shared/voice.js';
import { PlannerError } from './gemma.js';

const toolCallSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.literal('function').optional(),
  function: z.object({ name: z.string().max(64), arguments: z.string().max(12000) }),
});
export const conversationRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant', 'tool']),
        content: z.string().max(60000).nullable().optional(),
        tool_calls: z.array(toolCallSchema).max(4).optional(),
        tool_call_id: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(160),
});
export type ConversationRequest = z.infer<typeof conversationRequestSchema>;
type Part = Record<string, unknown>;

export function toGemmaContents(request: ConversationRequest) {
  const names = new Map<string, string>();
  return request.messages.flatMap((message) => {
    if (message.role === 'system') return [];
    const parts: Part[] = [];
    if (message.role === 'tool') {
      const name = names.get(message.tool_call_id ?? '');
      if (!name) throw new PlannerError('A tool result has no matching call.', 400);
      let result: unknown;
      try {
        result = JSON.parse(message.content || '{}');
      } catch {
        result = { message: message.content };
      }
      parts.push({ functionResponse: { name, response: { result } } });
    } else {
      if (message.content) parts.push({ text: message.content });
      for (const call of message.tool_calls ?? []) {
        const name = call.function.name as VoiceToolName;
        if (!Object.hasOwn(voiceToolArguments, name))
          throw new PlannerError('Unknown voice tool.', 400);
        let args: unknown;
        try {
          args = voiceToolArguments[name].parse(JSON.parse(call.function.arguments));
        } catch {
          throw new PlannerError('Invalid voice tool arguments.', 400);
        }
        names.set(call.id, name);
        parts.push({ functionCall: { name, args } });
      }
    }
    return parts.length ? [{ role: message.role === 'assistant' ? 'model' : 'user', parts }] : [];
  });
}

async function* googleEvents(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const event = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data && data !== '[DONE]') yield JSON.parse(data);
      }
      if (done) break;
    }
    if (buffer.trim()) throw new PlannerError('The model response was interrupted.', 502);
  } finally {
    reader.releaseLock();
  }
}

export async function* streamGemmaConversation(
  request: ConversationRequest,
  options: { apiKey?: string; model: string; fetcher?: typeof fetch },
  signal: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  if (!options.apiKey) throw new PlannerError("Gemma isn't set up yet.", 503);
  if (!/^gemma-4-[a-z0-9-]+$/.test(options.model))
    throw new PlannerError('Voice chat needs a Gemma 4 model.', 503);
  const contents = toGemmaContents(request);
  if (!contents.length) throw new PlannerError('The conversation message is missing.', 400);
  const response = await (options.fetcher ?? fetch)(
    `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': options.apiKey },
      signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: voiceSystemPrompt }] },
        contents,
        tools: [{ functionDeclarations: voiceTools }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingLevel: 'minimal' },
        },
      }),
    },
  );
  if (!response.ok || !response.body)
    throw new PlannerError(
      response.status === 429
        ? 'The Gemma rate limit has been reached. Try again in a moment.'
        : "Gemma couldn't answer in voice chat.",
      response.status === 429 ? 429 : 502,
    );
  const id = `chatcmpl-${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const chunk = (delta: object, finish_reason: string | null = null) => ({
    id,
    object: 'chat.completion.chunk',
    created,
    model: options.model,
    choices: [{ index: 0, delta, finish_reason }],
  });
  yield chunk({ role: 'assistant' });
  const calls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] =
    [];
  let hasText = false;
  for await (const event of googleEvents(response.body)) {
    if (event.error) throw new PlannerError('Gemma interrupted the voice chat.', 502);
    for (const part of event.candidates?.[0]?.content?.parts ?? []) {
      if (part.thought) continue;
      if (part.text) {
        hasText = true;
        yield chunk({ content: part.text });
      }
      if (part.functionCall) {
        const name = part.functionCall.name as VoiceToolName;
        if (!Object.hasOwn(voiceToolArguments, name) || calls.length)
          throw new PlannerError('Gemma returned an invalid tool choice.', 502);
        const parsed = voiceToolArguments[name].safeParse(part.functionCall.args ?? {});
        if (!parsed.success) throw new PlannerError('Gemma returned invalid tool arguments.', 502);
        calls.push({
          id: `call_${randomUUID().replaceAll('-', '')}`,
          type: 'function',
          function: { name, arguments: JSON.stringify(parsed.data) },
        });
      }
    }
  }
  if (!hasText && !calls.length) throw new PlannerError("Gemma didn't return a response.", 502);
  if (calls.length) yield chunk({ tool_calls: calls.map((call, index) => ({ index, ...call })) });
  yield chunk({}, calls.length ? 'tool_calls' : 'stop');
}
