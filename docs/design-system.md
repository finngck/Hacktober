# Design-System und Corporate Identity

Verbindlich für jede Oberfläche von Pivot (Planer und Landingpage). Neue Features übernehmen damit automatisch den gleichen Look. Agenten laden diese Regeln über den Projekt-Skill [`daylight-ui`](../.claude/skills/daylight-ui/SKILL.md).

## Marke

- **Stil:** coss-ui-Aufbau in der Pivot-Palette: beige App-Fläche, warmweiße Karten, feine Ränder, Oliv aus dem Logo-Verlauf für Aktionen, Fortschritt, Auswahl und Terminkarten, Grün-Schwarz für Text. Weitere Farbe trägt nur Bedeutung (Kategorien, Status).
- **Logo:** Pivot-App-Icon (`public/favicon.svg`) mit Wortmarke „Pivot“ in Inter (`Logo` in `src/components/daylight/AppHeader.tsx`). Die Landingpage (`index.html`, `src/styles/landing.css`) nutzt dieselbe neutrale Palette und Inter.
- **Tonalität:** Oberfläche und KI-Antworten sind **Englisch**: „you“, Sentence case, aktive Verben. Ein Button sagt, was passiert („Apply plan“), und der Toast danach greift dasselbe Wort auf („Plan applied“). Fehler erklären, was passiert ist und was hilft, ohne Entschuldigung.

## Tokens

Die einzige Quelle ist [`src/styles/theme.css`](../src/styles/theme.css). Die Namen folgen coss ui, deshalb übernehmen alle Komponenten die Marke automatisch.

| Rolle      | Token / Tailwind-Klasse                          | Einsatz                                        |
| ---------- | ------------------------------------------------ | ---------------------------------------------- |
| App-Fläche | `background`                                     | Seitenhintergrund                              |
| Fläche     | `card`, `popover`                                | Karten, Dialoge, Popovers                      |
| Text       | `foreground`, `muted-foreground`                 | Text, Nebentext                                |
| Aktion     | `primary`, `accent`, `ring`                      | Hauptaktion, Auswahl, Fokus                    |
| Priorität  | `priority-{high,medium,low}`                     | Terminkarten in Oliv: hoch dunkel, niedrig hell |
| Kategorien | `category-{study,work,recovery,movement,social}` | Reserve für Kategorie-Akzente                  |
| Status     | `success`, `warning`, `destructive`, `info`      | Rückmeldungen                                  |

Radien leiten sich aus `--radius` ab (`rounded-lg` für Bedienelemente, `rounded-xl`/`rounded-2xl` für Blöcke und Karten). Rohe Farbwerte in `src/**/*.ts(x)` sind verboten. `tests/design-system.test.ts` prüft das.

## Schrift

**Inter** (`font-sans`) für alles; Hierarchie über Größe und Gewicht (`font-semibold` für Titel), Zahlen mit `tabular`.

## Bewegung

Rückmeldung auf Handlungen ist kurz (`animate-pop`). Der Abschluss des Morgen-Check-ins nutzt `animate-sunburst` und `animate-rise`. Im aktiv gestarteten Sprachdialog reagiert eine runde Kugel mit fließenden Mint-/Smaragdverläufen auf den Audiopegel. Die Verläufe bleiben kreisförmig beschnitten; die Kugel bewegt sich sanft auf und ab, beim Verbinden und Planen langsamer, während einer Pause ruht sie. Keine Einblend-Animationen auf jedem Abschnitt. `prefers-reduced-motion` schaltet die Animationen ab.

## Komponenten

- `src/components/ui/`: coss ui (MIT, Quelle: [`cosscom/ui`](https://github.com/cosscom/ui/tree/3d8ca28e7d90123e9e0f44665944dc240b026ccb/apps/ui)). Die Dateien werden **nicht von Hand geändert**, Prettier ignoriert sie. Anpassungen gehören in Tokens oder in einen Daylight-Baustein.
- `src/components/daylight/`: Daylight-Bausteine. `DaylightSlider` für jede Werteinstellung, `ChoiceGroup`/`ChoiceItem`/`ChoiceChip` für Auswahl, `Timeline`, Check-in-Steuerelemente, Flow und Sidebar.
- Neue UI setzt nur diese beiden Ebenen und Tokens zusammen. Keine eigenen Buttons, Dialoge oder Farbwerte.
- Icons: HugeIcons über `src/components/Icon.tsx`. coss-Komponenten bringen intern Lucide-Icons mit, das bleibt so.

## Neue coss-Komponente hinzufügen

Die Registry ist in [`components.json`](../components.json) auf einen Commit gepinnt.

```sh
npx shadcn@latest add @coss/<name>
```

Danach prüfen, dass Importe auf `@/components/ui` und `@/lib/utils` zeigen, und `npm run build` und `npm test` ausführen. Kann die CLI `ui.shadcn.com` nicht erreichen, lässt sich die Datei aus `apps/ui/public/r/<name>.json` desselben Commits übernehmen. Dabei `@/registry/default/` durch `@/` ersetzen und die Zeile `"use client";` entfernen.
