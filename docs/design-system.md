# Design-System und Corporate Identity

Verbindlich für jede Oberfläche von Daylight. Neue Features übernehmen damit automatisch den gleichen Look. Agenten laden diese Regeln über den Projekt-Skill [`daylight-ui`](../.claude/skills/daylight-ui/SKILL.md).

## Marke

- **Idee:** Der Tag als Lichtverlauf. Die Sonne steht für Energie und für „jetzt“, das Abendblau für Entscheidungen.
- **Logo:** Wortmarke `daylight` in Bricolage Grotesque, davor die Sonne im runden Sonnengelb-Feld (`Logo` in `src/components/daylight/AppHeader.tsx`, Favicon `public/favicon.svg`). Nicht einfärben, nicht strecken.
- **Tonalität:** Deutsch, „du“, Satzanfang groß, aktive Verben. Ein Button sagt, was passiert („Plan übernehmen“), und der Toast danach greift dasselbe Wort auf („Plan übernommen“). Fehler erklären, was passiert ist und was hilft, ohne Entschuldigung. Keine Großbuchstaben-Labels, keine Pfeile in Button-Texten.

## Tokens

Die einzige Quelle ist [`src/styles/theme.css`](../src/styles/theme.css). Die Namen folgen coss ui, deshalb übernehmen alle Komponenten die Marke automatisch.

| Rolle      | Token / Tailwind-Klasse                          | Einsatz                                            |
| ---------- | ------------------------------------------------ | -------------------------------------------------- |
| Papier     | `background`                                     | Seitenhintergrund                                  |
| Fläche     | `card`, `popover`                                | Karten, Dialoge, Popovers                          |
| Tinte      | `foreground`, `muted-foreground`                 | Text, Nebentext                                    |
| Abendblau  | `primary`, `ring`, `accent`                      | Hauptaktion, Fokus, Auswahl                        |
| Sonnengelb | `sun`, `sun-ink`                                 | Logo, „Jetzt“, Serie, Abzeichen, nicht für Flächen |
| Himmel     | `--sky-*`                                        | Lichtleiste der Timeline und Slider-Verläufe       |
| Kategorien | `category-{study,work,recovery,movement,social}` | Nur zur Kennzeichnung von Aufgaben                 |
| Status     | `success`, `warning`, `destructive`, `info`      | Rückmeldungen                                      |

Radien leiten sich aus `--radius` ab (`rounded-lg` für Bedienelemente, `rounded-xl`/`rounded-2xl` für Blöcke und Karten). Rohe Farbwerte in `src/**/*.ts(x)` sind verboten. `tests/design-system.test.ts` prüft das.

## Schrift

- **Bricolage Grotesque** (`font-heading`): Überschriften, Datum, Uhrzeiten, große Slider-Werte.
- **Atkinson Hyperlegible Next** (`font-sans`): alles andere. Die Schrift ist auf Lesbarkeit ausgelegt, deshalb ist die Null durchgestrichen.

## Bewegung

Rückmeldung auf Handlungen ist kurz (`animate-pop`, Daumen am Slider). Der einzige längere Moment ist der Abschluss des Morgen-Check-ins (`animate-sunburst`, `animate-rise`). Keine Einblend-Animationen auf jedem Abschnitt. `prefers-reduced-motion` schaltet alle Animationen ab.

## Komponenten

- `src/components/ui/`: coss ui (MIT, Quelle: [`cosscom/ui`](https://github.com/cosscom/ui/tree/3d8ca28e7d90123e9e0f44665944dc240b026ccb/apps/ui)). Die Dateien werden **nicht von Hand geändert**, Prettier ignoriert sie. Anpassungen gehören in Tokens oder in einen Daylight-Baustein.
- `src/components/daylight/`: Daylight-Bausteine. `DaylightSlider` für jede Werteinstellung, `ChoiceGroup`/`ChoiceItem`/`ChoiceChip` für Auswahl, `Timeline` mit Lichtleiste, Check-in-Steuerelemente, Flow und Sidebar.
- Neue UI setzt nur diese beiden Ebenen und Tokens zusammen. Keine eigenen Buttons, Dialoge oder Farbwerte.
- Icons: HugeIcons über `src/components/Icon.tsx`. coss-Komponenten bringen intern Lucide-Icons mit, das bleibt so.

## Neue coss-Komponente hinzufügen

Die Registry ist in [`components.json`](../components.json) auf einen Commit gepinnt.

```sh
npx shadcn@latest add @coss/<name>
```

Danach prüfen, dass Importe auf `@/components/ui` und `@/lib/utils` zeigen, und `npm run build` und `npm test` ausführen. Kann die CLI `ui.shadcn.com` nicht erreichen, lässt sich die Datei aus `apps/ui/public/r/<name>.json` desselben Commits übernehmen. Dabei `@/registry/default/` durch `@/` ersetzen und die Zeile `"use client";` entfernen.
