import assert from 'node:assert/strict';
import { config } from '../server/config.js';
import { generatePlan } from '../server/gemma.js';
import { streamGemmaConversation, type ConversationRequest } from '../server/gemma-conversation.js';
import { executeVoiceReplan, describeDay } from '../src/voice-tools.js';
import { freshWorkspace } from '../src/state.js';

let workspace = freshWorkspace();
const messages: ConversationRequest['messages'] = [
  {
    role: 'user',
    content:
      'My train is delayed. I am only available from 14:00 and have low energy. Please replan my day.',
  },
];
let applied = false;
for (let turn = 0; turn < 5; turn++) {
  let text = '';
  let calls: { id: string; function: { name: string; arguments: string } }[] = [];
  for await (const event of streamGemmaConversation(
    { messages },
    config,
    new AbortController().signal,
  )) {
    const delta = (event.choices as { delta: { content?: string; tool_calls?: typeof calls } }[])[0]
      .delta;
    text += delta.content ?? '';
    if (delta.tool_calls) calls = delta.tool_calls;
  }
  console.log(JSON.stringify({ turn, text, tools: calls.map((call) => call.function.name) }));
  messages.push({
    role: 'assistant',
    content: text || null,
    tool_calls: calls.length ? calls : undefined,
  });
  if (!calls.length) {
    assert.equal(applied, true, 'The agent must actually replan before reporting success.');
    break;
  }
  for (const call of calls) {
    let outcome: unknown;
    if (call.function.name === 'get_day_plan') outcome = describeDay(workspace);
    else if (call.function.name === 'replan_day') {
      outcome = await executeVoiceReplan(JSON.parse(call.function.arguments).message, {
        read: () => workspace,
        request: async (source, message) =>
          generatePlan({ plan: source.plan, checkIn: source.checkIn, message }, config),
        commit: (next) => {
          workspace = next;
          applied = true;
        },
        showResult: () => {},
        signal: new AbortController().signal,
      });
      console.log(JSON.stringify({ outcome }));
    } else throw new Error('Unexpected tool');
    messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(outcome) });
  }
}
assert.equal(applied, true);
assert.equal(workspace.plan.availableFrom, 840);
assert.equal(workspace.history.length, 1);
console.log('Live voice planning loop passed with synthetic data.');
