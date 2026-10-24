import type { ReplanRequest, ReplanResponse } from './contracts.js';

export type PlanningConversation = NonNullable<ReplanRequest['conversation']>;

export function continueConversation(
  request: Pick<ReplanRequest, 'message' | 'conversation'>,
  response: ReplanResponse,
): PlanningConversation {
  if (response.result.status === 'proposal') return [];
  const exchanges = [
    ...(request.conversation ?? []),
    { message: request.message, reply: response.result.question ?? response.result.summary },
  ];
  // Keep the original request even after several follow-up questions.
  return exchanges.length <= 4 ? exchanges : [exchanges[0], ...exchanges.slice(-3)];
}
