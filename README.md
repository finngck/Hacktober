# Hacktober

Gemeinsames Repository für die Umsetzung der **Chat Core Features** aus der [Notion-Teamseite](https://app.notion.com/p/q-summit/Hacktoberfest-403024b9b73b80c2be88d09ff91a9d08).

## Pivot im Überblick

**Your day changes. Your plan should too.** Pivot ist ein adaptiver Tagesplaner für Studierende und Young Professionals mit wechselnden Verpflichtungen. Er kombiniert Termine, Aufgaben, Präferenzen und das aktuelle Energielevel und plant den Tag nach einer unerwarteten Änderung neu: Du schreibst oder sagst, was sich geändert hat. Textvorschläge bestätigst du nach dem Vergleich; klare Sprachaufträge werden direkt umgesetzt und erklärt, mit Undo.

Live: **https://hacktober-daylight.vercel.app** mit Landing Page unter `/` und Planer unter `/app` (synthetischer Beispieltag, Demo-Uhrzeit 13:00 Uhr am 24.10.2026, Europe/Berlin).

Oberfläche, Landing Page und alle KI-Antworten (Gemma-Vorschläge, Screenshot-Import, Sprachagent) sind auf **Englisch**; Uhrzeiten bleiben im 24-Stunden-Format. Die Repository-Doku bleibt deutsch.

Die Landing Page besteht aus `index.html`, `src/landing.ts` und `src/styles/landing.css`, der Planer aus `app.html` und `src/main.tsx`. Logo-Dateien liegen in `brand/`; `public/favicon.svg` ist das App-Icon.

### Technologien

- **Gemma 4** (`gemma-4-26b-a4b-it`, offenes Modell über die Google-API) übernimmt die Sprachverarbeitung: Es versteht die Änderung („Zug verspätet, schlecht geschlafen“), priorisiert Aufgaben, begründet Abwägungen, erkennt Signale für Maßnahmen und liest Aufgaben und Zeiten aus Screenshots. Die Uhrzeiten rechnet der regelbasierte Scheduler; der Server prüft jeden Vorschlag, bevor er angezeigt wird.
- **React, TypeScript, Vite, Tailwind CSS 4** und Komponenten aus [coss ui](https://coss.com/ui) (Base UI, MIT) für die Oberfläche, **Express** als Backend, **Zod** für die Schemas, **Vercel** fürs Hosting. Farben, Schrift und Regeln für neue UI stehen im [Design-System](docs/design-system.md).
- **ElevenLabs** übernimmt Spracherkennung, Sprachausgabe und Gesprächswechsel. Gemma führt das Gespräch und ruft die Planungswerkzeuge auf. Der private Agent ist über einen authentifizierten Custom-LLM-Endpunkt mit dem Planer verbunden.
- **Lizenz:** MIT.

### Was funktioniert

- Tagesansicht mit festen Terminen, flexiblen Aufgaben, Pausen, Dauer, Priorität und Fristen.
- Daily Check-in als Morgen-Flow und in der Sidebar per Popover: Schlafdauer und -qualität, Energie, Stimmung, Stress, Fokus des Tages, produktive Zeit und Ausschlüsse (kein Kaffee, kein Joggen, kein Gym) als harte Regeln. Die Fokusaufgabe plant der Scheduler zuerst ein; Stimmung, Stress und Schlafqualität gehen als Kontext an Gemma. Check-in-Serie und Abzeichen zählen nur lokal (`daylight.progress.v1`).
- Änderung als Text eingeben → Gemma-4-Vorschlag → Vorher/Nachher mit Erklärung → übernehmen oder verwerfen, mit Undo.
- Feste Termine bleiben für den Planer unverändert und lassen sich nur auf ausdrücklichen Wunsch verschieben („Team-Meeting 15 Minuten früher“).
- Maßnahmen bei wenig Schlaf oder Energie aus einem Pool (Koffein, Nap, Bewegung) mit Sperren und Ausschlüssen. Gemma meldet nur Signale, die Auswahl trifft der Code.
- Screenshot-Import: Aufgaben, Termine und Fristen aus PNG, JPEG oder WebP bis 20 MB lesen, prüfen und korrigieren, erst dann hinzufügen. Der Browser verkleinert große Bilder und erhält dunklen Text auf transparentem Hintergrund. Schließen bricht den Upload ab; verspätete Ergebnisse werden ignoriert. Die Erkennungsqualität bei beliebigen echten Screenshots ist nicht breit geprüft.
- Aufgaben von Hand hinzufügen.
- „Sprich mit Pivot“: Ein klarer Sprachauftrag übernimmt den validierten Plan direkt. Der Agent erklärt danach die tatsächlichen Änderungen; Rückfragen und Konflikte verändern den Plan nicht. Undo funktioniert per Stimme oder Schaltfläche.

### Noch nicht umgesetzt

- Kalender-Anbindung (Google, Apple, Outlook), Anbindung von Notizen und To-do-Apps.
- Wearables (WHOOP, Oura, Apple Health). Der Check-in ist manuell.
- Life-Balance-Skalen, Routen und Besorgungen, Onboarding mit Zielen und Routinen, lernende Anpassung, Abendreflexion.
- Login und Datenbank: Der Browser speichert Plan, Check-in und fünf Undo-Schritte nur lokal pro Gerät.
- Der Plan gilt für einen Tag. Es gibt keinen simulierten KI-Fallback: Ohne Key oder bei Modellfehler erscheint eine sichtbare Fehlermeldung.

Aufgaben, Check-in, Präferenzen, Nachrichten und Screenshots werden zur Verarbeitung an die Google-API gesendet; Bilder werden nicht gespeichert. Die App gibt keine medizinischen Ratschläge.

## Einstieg

```sh
git clone https://github.com/finngck/Hacktober.git
cd Hacktober
```

Vor Änderungen [AGENTS.md](AGENTS.md) und den [Arbeitsablauf](docs/workflow.md) lesen. Claude Code lädt die Regeln über [CLAUDE.md](CLAUDE.md).

## Lokal starten

Voraussetzung: Node.js ab 22.14 und npm.

```sh
npm ci
cp .env.example .env
```

In `.env` den eigenen `GEMMA_API_KEY` hinterlegen oder mit `GEMMA_KEY_FILE` auf eine bereits vorhandene lokale Schlüsseldatei verweisen. Unterstützt werden auch `GEMINI_API_KEY` und `GOOGLE_API_KEY`. Der Schlüssel wird ausschließlich serverseitig an Google gesendet; keine `VITE_`-Variable dafür verwenden. `.env` und benannte Env-Dateien sind von Git ausgeschlossen.

```sh
npm run dev
```

App: **http://localhost:3000**. Der lokale Server bindet ausschließlich an `127.0.0.1`. Optional `PORT` in `.env` ändern. Nach Änderungen der Konfiguration den Server neu starten.

## Sprachdialog einrichten

Mit `npx -y @elevenlabs/cli@latest onboard init` anmelden. Die CLI speichert `ELEVENLABS_API_KEY` in der ignorierten `.env.local`; der Server lädt diese Datei vor `.env`. Google/Gemma und ElevenLabs dürfen unterschiedliche Konten verwenden. Der konfigurierte ElevenLabs-Agent und dessen Key müssen dagegen zum selben ElevenLabs-Konto gehören.

```sh
npm run voice:setup -- https://DEINE-APP-ADRESSE
```

Der Befehl erstellt einen privaten ElevenLabs-Agenten im Konto des Keys, registriert `get_day_plan`, `replan_day` und `undo_last_change` mit Ergebniserwartung und verbindet Gemma als Custom LLM. Agent-ID und ein zufälliges gemeinsames Endpoint-Secret landen ausschließlich in der ignorierten `.env`. Erneutes Ausführen aktualisiert den dort konfigurierten Agenten. Ein fremder Agent aus einem anderen Konto wird nicht verwendet. `ELEVENLABS_VOICE_ID` kann vor der Einrichtung eine andere verfügbare Stimme wählen.

Die App-Adresse muss für ElevenLabs öffentlich über HTTPS erreichbar sein; in ElevenLabs wird die Basis `/api/voice/v1` eingetragen. ElevenLabs ergänzt daraus den Custom-LLM-Endpunkt `/api/voice/v1/chat/completions`. Für lokale Entwicklung denselben Code öffentlich hosten oder einen eigenen HTTPS-Tunnel konfigurieren. Browser benötigen Mikrofonfreigabe und HTTPS oder localhost. Während eines Gesprächs ist auch eine Texteingabe möglich.

Audio und Transkripte werden durch ElevenLabs verarbeitet; Gespräch, Tool-Ergebnisse und für die Planung benötigte Tagesdaten gehen an Google. Die Schlüssel bleiben serverseitig. Der Browser erhält nur eine zeitlich begrenzte signierte Gesprächsadresse. Die App hält den aktuellen Plan und den Undo-Verlauf weiterhin lokal.

```sh
npm test
npm run build
npm start
```

`npm test` prüft ohne externen Modellaufruf Zeitplanung, Planregeln, den Gemma-Adapter und die Design-System-Regeln. `npm run build` prüft die TypeScript-Typen und baut die Oberfläche. `npm run format:check` prüft die Formatierung. `npm start` benötigt den vorherigen Build und startet denselben lokalen Node-Server mit den gebauten Dateien.

`npm run test:upload` prüft den Screenshot-Ablauf in einem echten Browser mit synthetischen Bildern und simulierten Modellantworten: Dateiformate, Transparenz, Komprimierung, Abbruch, Zeitlimit, Fehleranzeige und bestätigte Übernahme samt Neuladen. Einmalig `npx playwright install chromium` ausführen; alternativ vorhandenes Chrome mit `PLAYWRIGHT_CHANNEL=chrome npm run test:upload` verwenden. Für WebKit: `npx playwright install webkit` und `UPLOAD_BROWSER=webkit npm run test:upload`. Die Tests starten ihren eigenen lokalen Server und brauchen keinen API-Key.

`npm run test:live` prüft fünf synthetische Fälle mit dem lokal eingerichteten Gemma-Key: ausdrücklich verschobener fester Termin, Zugverspätung mit wenig Energie, zusätzliche Marketing-Klausur, Bearbeitung vorhandener Marketing-Lernzeit und neue Aufgabe zusammen mit geänderter Verfügbarkeit. Jeder Fall erlaubt maximal einen Reparaturversuch; der Befehl verbraucht API-Kontingent.

`npm run test:voice:live` prüft den Gemma-Gesprächszyklus einschließlich Tool Call, tatsächlicher Planänderung und anschließender Erklärung mit synthetischen Daten. Der Test benötigt den Google-Key und verbraucht API-Kontingent. `npm test` prüft zusätzlich Streaming, Tool-Rückgaben, Authentifizierung sowie Abbruch- und Konfliktfälle ohne externe Modellaufrufe.

## GitHub und Vercel

Das Vercel-Projekt `hacktober-daylight` ist mit `finngck/Hacktober` verbunden. `main` ist der gemeinsame Produktionsstand; Featurebranches erhalten Vorschau-Deployments über die Git-Verbindung. Änderungen weiterhin per geprüftem PR integrieren.

Vercel baut die Vite-Oberfläche aus `dist/` und führt die Dateien unter `api/` als Node-Funktionen aus. Lokaler und gehosteter Betrieb verwenden dieselbe Express-App und Planungslogik. `vercel.json` enthält die Build-Konfiguration; die Umplanungsfunktion hat maximal 70 Sekunden Laufzeit. Der Screenshot-Import begrenzt seine höchstens zwei Modellversuche auf jeweils 25 Sekunden, damit sie innerhalb seiner 60 Sekunden Funktionslaufzeit abschließen.

Relative Imports im von Node geladenen Servercode verwenden explizite `.js`-Endungen. Bei Fork-PRs kann der Vercel-Check zunächst eine Freigabe durch ein Teammitglied verlangen; der Link steht im Bot-Kommentar am PR. Vor der Integration Build und betroffene API in der Preview prüfen, danach den Produktionsstand. Der konkrete Ablauf steht im [Arbeitsablauf](docs/workflow.md#vercel-vor-und-nach-dem-merge).

Den `GEMMA_API_KEY` ausschließlich als geheime serverseitige Vercel-Umgebungsvariable hinterlegen. `.env` und die lokale Schlüsseldatei werden nicht hochgeladen. Zusätzliche eigene Hostnamen können mit `APP_HOSTS` (kommagetrennt, ohne Protokoll) freigegeben werden; die Vercel-Deployment-, Branch- und Produktionsadressen werden automatisch berücksichtigt.

Für Sprache zusätzlich `ELEVENLABS_API_KEY` und `VOICE_LLM_SECRET` als Vercel-Secrets sowie `ELEVENLABS_AGENT_ID` als serverseitige Konfiguration setzen. Das Endpoint-Secret muss mit dem bei ElevenLabs hinterlegten Custom-LLM-Secret übereinstimmen. Nach Änderungen neu deployen. Keine dieser Variablen mit `VITE_` präfixieren.

Die vorbereitete Versionsschnittstelle liest nur den öffentlichen Repository-Verlauf, keine GitHub- oder Vercel-Tokens. Browserdaten bleiben pro Gerät und Domain lokal; es gibt noch keine gemeinsame Datenspeicherung.

## Schnittstellen und Planregeln

- `GET /api/health`: lokale Konfiguration (`configured`, `model`); bestätigt keine externe Erreichbarkeit.
- `GET /api/versions`: öffentliche GitHub-Commits und erfolgreiche Deployment-Links, kurz zwischengespeichert.
- `POST /api/extract`: `{ image (Base64), mimeType }` → `{ tasks, note, meta }`. Gemma liest Aufgaben, Termine und Fristen aus einem Screenshot (PNG, JPEG, WebP, bis 3.500.000 Base64-Zeichen, etwa 2,5 MB). Der Browser komprimiert größere Originaldateien vor dem Upload und begrenzt den gesamten Vorgang auf 65 Sekunden. Die Oberfläche zeigt die Treffer zur Prüfung und Korrektur; erst die Bestätigung fügt sie dem Plan hinzu. Das Bild wird nicht gespeichert, aber zur Analyse an Google gesendet. Vorübergehende Provider- und Verbindungsfehler sowie ungültige Antworten teilen sich ein Limit von insgesamt zwei Modellaufrufen.
- `POST /api/replan`: `{ plan, checkIn, message }` → `{ result, proposedPlan, meta }`. Gemeinsame Zod-Schemas und Typen: [`shared/contracts.ts`](shared/contracts.ts).
- `GET /api/voice/status`: meldet, ob die Sprachkonfiguration vorhanden ist, ohne Schlüssel auszugeben.
- `POST /api/voice/session`: erstellt serverseitig eine kurzlebige signierte ElevenLabs-Gesprächsadresse.
- `POST /api/voice/v1/chat/completions`: authentifizierter Custom-LLM-Adapter, der Gemma-Text und Tool Calls als SSE an ElevenLabs streamt. Dieser Server-Aufruf benötigt `Authorization: Bearer VOICE_LLM_SECRET`.
- `server/gemma.ts`: Google-REST-Adapter mit `gemma-4-26b-a4b-it` als Standard; über `GEMMA_MODEL` auf ein anderes freigegebenes Gemma-4-Modell umstellbar. [Offizielle Modell-Dokumentation](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api).
- `server/scheduler.ts`: Zeitplanung anhand der von Gemma erkannten Verfügbarkeit, Energie, Aufgabenreihenfolge und zurückzustellenden Arbeit.
- `src/components/daylight/`: Tagesansicht, Vergleich, Check-in-Flow und -Sidebar. `src/components/ui/`: unveränderte coss-ui-Komponenten. `shared/demo.ts`: synthetischer Beispieltag und Texte zum Ausprobieren.

Gemma arbeitet ausschließlich über native Function Calls (`ANY`): `create_task`, `update_task`, `move_task`, `prioritize_tasks`, `defer_tasks`, `update_day_context`, `replan_day` und `ask_clarification`. Der Server prüft die vollständige Aufrufserie und führt sie auf einer Kopie aus. Aufgabenänderungen brauchen ein wörtliches Zitat aus der Nachricht; unbekannte Tools, Argumente, IDs sowie Änderungen an begonnenen Blöcken werden abgelehnt. Feste zukünftige Termine lassen sich ausschließlich über `move_task` auf ausdrücklichen Nutzerwunsch verschieben. Neue Aufgaben verwenden feste Bausteine (z. B. Klausurvorbereitung: 90 Minuten, hohe Priorität), wenn keine Dauer genannt wurde. Eine weitere Klausur erzeugt eine eigene Lernaufgabe; explizite Korrekturen bearbeiten die passende bestehende Aufgabe. Die im Check-in gewählte Fokusaufgabe setzt der Scheduler unter der optionalen Arbeit zuerst ein und stellt sie bei wenig Energie nicht zurück.

Der regelbasierte Scheduler reserviert zuerst heutige Fristen und Erholung, dann neu angeforderte oder bearbeitete Aufgaben, danach optionale Arbeit. Bereits passende Startzeiten bleiben möglichst erhalten; bei Platzproblemen folgt ein verdichteter Versuch. Eine angeforderte Aufgabe wird eingeplant oder erzeugt einen sichtbaren Konflikt. Zusammenfassung und Änderungsgründe entstehen aus dem tatsächlich berechneten Vorschlag. Alle bestehenden Aufgaben bleiben erhalten, auch wenn sie heute offen sind. Der Server prüft zusätzlich Dauern, feste und begonnene Termine, Verfügbarkeit, Tagesgrenzen, Überschneidungen, heutige Fristen und Ausschlüsse. Ungültige Tool-Aufrufe erhalten maximal einen Reparaturversuch. Konflikte und Rückfragen lassen sich nicht übernehmen.

`start: null` heißt **heute offen**, nicht automatisch auf morgen verschoben. Ein ausdrücklicher Sprachauftrag übernimmt den validierten Plan direkt mit Undo. Die Verfügbarkeit wird bei Übernahme im Plan gespeichert. Textvorschläge ändern den aktiven Plan erst nach deiner Bestätigung. Die Zeitplanung ist eine Heuristik für einen einzelnen Tag, kein vollständiger Optimierer. Die Auswahl der passenden Tools und Argumente bleibt Modellleistung. Bei jeder Planung werden Aufgaben, Check-in, Präferenzen und Nachricht an die Google-API gesendet. Die Anbindung folgt Googles [Gemma Function-Calling-Schnittstelle](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api#function-calling).

## Saubere Arbeitskopie aktualisieren

Laufende Arbeit zuerst auf dem eigenen Branch sichern (committen). Danach `main` aktualisieren:

```sh
git switch main
git pull --ff-only origin main
```

Schlägt `--ff-only` fehl, abbrechen und nichts zurücksetzen; den Stand klären, statt ihn zu überschreiben.

## Zusammenarbeit

Vier Instanzen arbeiten in getrennten lokalen Klonen und auf eigenen Branches. Änderungen kommen als Pull Requests nach `main`. Alle Teammitglieder mit GitHub-Schreibrechten und ihre beauftragten Instanzen dürfen passende PRs nach Prüfung integrieren.

- [Startprompts für den ursprünglichen Kooperationstest](docs/cooperation-test.md)
- [Dokumentation und Quellenregeln](docs/README.md)
- [Offene Entscheidungen](docs/open-questions.md)

Produktideen und optionale Erweiterungen bleiben in Notion. Das Repository dokumentiert bestätigte Entscheidungen und den tatsächlich implementierten Stand.

## Lizenz

Das Projekt steht unter der [MIT-Lizenz](LICENSE).
