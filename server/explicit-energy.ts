import type { ReplanRequest } from '../shared/contracts.js';

// A conservative reading of direct first-person fatigue reports. The model
// handles other wording; a later correction stops this rule from applying.
// In particular, a task-name answer must not erase an unresolved fatigue report.
export function explicitLowEnergy(request: ReplanRequest): 'low' | undefined {
  const messages = [...(request.conversation ?? []).map((turn) => turn.message), request.message];
  for (const message of messages.toReversed()) {
    const text = message.toLocaleLowerCase('de');
    if (
      !/\b(?:kopf|energie|erschöpft|platt|müde|fit|konzentrieren|besser|ausgeruht|erholt|wach)\b/u.test(
        text,
      )
    )
      continue;
    // A newer correction, negation, quotation or hypothetical belongs to Gemma;
    // do not carry an older low-energy assumption across it.
    if (/["„“»«]|\b(?:nicht|kein bisschen|wenn|falls|angenommen)\b/u.test(text)) return undefined;
    const modifiers =
      '(?:(?:gerade|heute|jetzt|einfach|wirklich|echt|total|sehr|ziemlich|leider|mehr)\\s+)*';
    const report = new RegExp(
      `(?:^|[.!?;]\\s*|\\bund\\s+)(?:ja,?\\s+)?ich\\s+(?:(?:habe|hab)\\s+${modifiers}(?:keinen\\s+kopf|(?:wenig|kaum|keine)\\s+energie)|bin\\s+${modifiers}(?:erschöpft|platt|müde))\\b`,
      'u',
    );
    return report.test(text) ? 'low' : undefined;
  }
  return undefined;
}
