---
name: daylight-ui
description: Daylight design system and corporate identity. Use before building or changing any Daylight UI (components, pages, dialogs, check-in, timeline, copy) so new features keep the same look, tokens and tone.
---

# Daylight UI

1. Read `docs/design-system.md`. It is binding: tokens from `src/styles/theme.css`, coss ui components from `src/components/ui/` (never edited by hand), Daylight building blocks from `src/components/daylight/`.
2. Compose new UI from those layers. Use `DaylightSlider` for any value a person sets, `ChoiceGroup`/`ChoiceItem`/`ChoiceChip` for choices, coss `Dialog`, `Popover`, `Menu`, `Toast` and `Tooltip` for overlays and feedback. No raw colour values, no new CSS files outside `src/styles/`.
3. Missing a primitive? Add it from the pinned coss registry as described in the design-system doc instead of writing a custom one.
4. Copy is English (UI and AI responses), uses "you", sentence case and active verbs; the action word stays the same from button to toast.
5. Before handing off: `npm run format:check`, `npm run build`, `npm test` (includes `tests/design-system.test.ts`), then check the change at 390 px and 1440 px width, by keyboard and with reduced motion.

Helpful external skills (install locally if available, they are not vendored here):

- Anthropic `frontend-design`: design direction and self-critique.
- Vercel `web-design-guidelines`: accessibility and UX audit of the changed files.
- Vercel `composition-patterns`: component APIs without boolean-prop sprawl.
- `interaction-design` (wshobson/agents) or Impeccable `/animate`, for micro-interactions within the motion rules above.
