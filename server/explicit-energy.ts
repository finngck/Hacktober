import type { ReplanRequest } from '../shared/contracts.js';

// A conservative reading of direct first-person fatigue reports. The model
// handles other wording; a later correction stops this rule from applying.
// In particular, a task-name answer must not erase an unresolved fatigue report.
export function explicitLowEnergy(request: ReplanRequest): 'low' | undefined {
  const messages = [...(request.conversation ?? []).map((turn) => turn.message), request.message];
  for (const message of messages.toReversed()) {
    const text = message.toLocaleLowerCase('en-US').replace(/\u2019/gu, "'");
    if (
      !/\b(?:head|brain|energy|exhausted|wiped|drained|tired|beat|fried|fit|concentrate|focus|better|rested|recovered|awake|fresh)\b/u.test(
        text,
      )
    )
      continue;
    // A newer correction, negation, quotation or hypothetical belongs to Gemma;
    // do not carry an older low-energy assumption across it.
    if (
      /["\u201C\u201D\u201E\u00AB\u00BB]|n't\b|\b(?:not|no longer|if|when|suppose|assuming|imagine)\b/u.test(
        text,
      )
    )
      return undefined;
    const modifiers =
      '(?:(?:just|really|so|totally|completely|very|pretty|quite|already|kind\\s+of|a\\s+bit|today|now|right\\s+now)\\s+)*';
    const report = new RegExp(
      `(?:^|[.!?;]\\s*|\\band\\s+)(?:(?:yes|yeah),?\\s+)?(?:i(?:\\s+have|'ve\\s+got|\\s+got)\\s+${modifiers}(?:no|little|hardly\\s+any|low)\\s+energy|(?:i'm|i\\s+am|i\\s+feel|i'm\\s+feeling)\\s+${modifiers}(?:exhausted|wiped(?:\\s+out)?|drained|tired|beat|worn\\s+out|fried)|my\\s+(?:head|brain)\\s+is\\s+${modifiers}(?:done|fried))\\b`,
      'u',
    );
    return report.test(text) ? 'low' : undefined;
  }
  return undefined;
}
