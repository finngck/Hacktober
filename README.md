# Hacktober

Gemeinsames Repository für die Umsetzung der **Chat Core Features** aus der [Notion-Teamseite](https://app.notion.com/p/q-summit/Hacktoberfest-403024b9b73b80c2be88d09ff91a9d08).

## Daylight im Überblick

**Your day changes. Your plan should too.** Daylight ist ein adaptiver Tagesplaner für Studierende und Young Professionals mit wechselnden Verpflichtungen. Er kombiniert Termine, Aufgaben, Präferenzen und das aktuelle Energielevel und plant den Tag nach einer unerwarteten Änderung neu: Du schreibst, was sich geändert hat, siehst Vorher und Nachher mit Begründung und bestätigst erst dann.

Live: **https://hacktober-daylight.vercel.app** (synthetischer Beispieltag, Demo-Uhrzeit 13:00 Uhr am 24.10.2026, Europe/Berlin).

### Technologien

- **Gemma 4** (`gemma-4-26b-a4b-it`, offenes Modell über die Google-API) übernimmt die Sprachverarbeitung: Es versteht die Änderung („Zug verspätet, schlecht geschlafen“), priorisiert Aufgaben, begründet Abwägungen, erkennt Signale für Maßnahmen und liest Aufgaben und Zeiten aus Screenshots. Die Uhrzeiten rechnet der regelbasierte Scheduler; der Server prüft jeden Vorschlag, bevor er angezeigt wird.
- **React, TypeScript, Vite** für die Oberfläche, **Express** als Backend, **Zod** für die Schemas, **Vercel** fürs Hosting.
- **ElevenLabs:** Im Planer ist derzeit **keine** ElevenLabs-Funktion aktiv. Das frühere Widget wurde entfernt, weil es nicht mit dem Plan verbunden war. Geplant ist ein gesprochener Überblick über die Änderungen nach „Plan übernehmen“; diese Zeile wird mit der Umsetzung aktualisiert.
- **Lizenz:** MIT.

### Was funktioniert

- Tagesansicht mit festen Terminen, flexiblen Aufgaben, Pausen, Dauer, Priorität und Fristen.
- Manueller Check-in (Schlaf, Energie, produktive Zeit) und Ausschlüsse (kein Kaffee, kein Joggen, kein Gym) als harte Regeln.
- Änderung als Text eingeben → Gemma-4-Vorschlag → Vorher/Nachher mit Erklärung → übernehmen oder verwerfen, mit Undo.
- Feste Termine bleiben für den Planer unverändert und lassen sich nur auf ausdrücklichen Wunsch verschieben („Team-Meeting 15 Minuten früher“).
- Maßnahmen bei wenig Schlaf oder Energie aus einem Pool (Koffein, Nap, Bewegung) mit Sperren und Ausschlüssen. Gemma meldet nur Signale, die Auswahl trifft der Code.
- Screenshot-Import: Aufgaben, Termine und Fristen aus einem Bild lesen, prüfen und korrigieren, erst dann hinzufügen. Mit einem synthetischen Stundenplan in der Vorschau getestet; die Erkennungsqualität bei echten Screenshots ist nicht breit geprüft.
- Aufgaben von Hand hinzufügen.

### Noch nicht umgesetzt

- Spracheingabe (Mikrofon-Button) und Sprachausgabe im Planer.
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

```sh
npm test
npm run build
npm start
```

`npm test` prüft ohne externen Modellaufruf Zeitplanung, Planregeln und den Gemma-Adapter. `npm run build` prüft die TypeScript-Typen und baut die Oberfläche. `npm run format:check` prüft die Formatierung. `npm start` benötigt den vorherigen Build und startet denselben lokalen Node-Server mit den gebauten Dateien.

`npm run test:live` ruft mit dem lokal eingerichteten Key tatsächlich Gemma auf (synthetischer Zugverspätungs-Test, maximal ein Reparaturversuch) und verbraucht API-Kontingent.

## GitHub und Vercel

Das Vercel-Projekt `hacktober-daylight` ist mit `finngck/Hacktober` verbunden. `main` ist der gemeinsame Produktionsstand; Featurebranches erhalten Vorschau-Deployments über die Git-Verbindung. Änderungen weiterhin per geprüftem PR integrieren.

Vercel baut die Vite-Oberfläche aus `dist/` und führt die drei Dateien unter `api/` als Node-Funktionen aus. Lokaler und gehosteter Betrieb verwenden dieselbe Express-App und Planungslogik. `vercel.json` enthält die Build-Konfiguration; die Umplanungsfunktion hat maximal 70 Sekunden Laufzeit.

Relative Imports im von Node geladenen Servercode verwenden explizite `.js`-Endungen. Bei Fork-PRs kann der Vercel-Check zunächst eine Freigabe durch ein Teammitglied verlangen; der Link steht im Bot-Kommentar am PR. Vor der Integration Build und betroffene API in der Preview prüfen, danach den Produktionsstand. Der konkrete Ablauf steht im [Arbeitsablauf](docs/workflow.md#vercel-vor-und-nach-dem-merge).

Den `GEMMA_API_KEY` ausschließlich als geheime serverseitige Vercel-Umgebungsvariable hinterlegen. `.env` und die lokale Schlüsseldatei werden nicht hochgeladen. Zusätzliche eigene Hostnamen können mit `APP_HOSTS` (kommagetrennt, ohne Protokoll) freigegeben werden; die Vercel-Deployment-, Branch- und Produktionsadressen werden automatisch berücksichtigt.

Die vorbereitete Versionsschnittstelle liest nur den öffentlichen Repository-Verlauf, keine GitHub- oder Vercel-Tokens. Browserdaten bleiben pro Gerät und Domain lokal; es gibt noch keine gemeinsame Datenspeicherung.

## Schnittstellen und Planregeln

- `GET /api/health`: lokale Konfiguration (`configured`, `model`); bestätigt keine externe Erreichbarkeit.
- `GET /api/versions`: öffentliche GitHub-Commits und erfolgreiche Deployment-Links, kurz zwischengespeichert.
- `POST /api/extract`: `{ image (Base64), mimeType }` → `{ tasks, note, meta }`. Gemma liest Aufgaben, Termine und Fristen aus einem Screenshot (PNG, JPEG, WebP, bis etwa 2,5 MB). Die Oberfläche zeigt die Treffer zur Prüfung und Korrektur; erst die Bestätigung fügt sie dem Plan hinzu. Das Bild wird nicht gespeichert, aber zur Analyse an Google gesendet. Das konfigurierte Modell hat in der Vorschau einen synthetischen Stundenplan korrekt gelesen; `npm run test:live` deckt den Bildpfad nicht ab.
- `POST /api/replan`: `{ plan, checkIn, message }` → `{ result, proposedPlan, meta }`. Gemeinsame Zod-Schemas und Typen: [`shared/contracts.ts`](shared/contracts.ts).
- `server/gemma.ts`: Google-REST-Adapter mit `gemma-4-26b-a4b-it` als Standard; über `GEMMA_MODEL` auf ein anderes freigegebenes Gemma-4-Modell umstellbar. [Offizielle Modell-Dokumentation](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api).
- `server/scheduler.ts`: Zeitplanung anhand der von Gemma erkannten Verfügbarkeit, Energie, Aufgabenreihenfolge und zurückzustellenden Arbeit.
- `src/components/Timeline.tsx`: Tagesansicht und Vergleich. `shared/demo.ts`: synthetischer Beispieltag und Texte zum Ausprobieren.

Gemma interpretiert die Nachricht, priorisiert die Aufgaben und begründet Abwägungen. Der regelbasierte Scheduler setzt sie in freie Zeitfenster: zunächst heutige Fristen und bei wenig Energie bestehende Erholungspausen, danach die übrigen Aufgaben nach Modellpriorität. Bereits passende optionale Startzeiten bleiben erhalten. Der Server prüft den fertigen Vorschlag zusätzlich auf eindeutige Aufgaben-IDs, vollständige Erhaltung der Aufgaben, unveränderte Dauern, feste und begonnene Termine, Verfügbarkeit, Tagesgrenzen, Überschneidungen, heutige Fristen und explizit ausgeschlossene Aktivitätstags. Eine ungültige Modellinterpretation erhält maximal einen Reparaturversuch. Konflikte und Rückfragen lassen sich nicht übernehmen.

Feste zukünftige Termine werden nur auf ausdrücklichen Nutzerwunsch verschoben, etwa „Team-Meeting 15 Minuten früher“. Begonnene oder vergangene Blöcke bleiben unverändert; Fristen, Tagesgrenzen und Überschneidungen werden auch bei ausdrücklich gewünschten Verschiebungen geprüft.

`start: null` heißt **heute offen**, nicht automatisch auf morgen verschoben. Die Verfügbarkeit wird bei Übernahme im Plan gespeichert. Nur eine ausdrückliche Bestätigung ändert den aktiven Plan. Die Zeitplanung ist eine Heuristik für einen einzelnen Tag, kein vollständiger Optimierer. Das Verständnis natürlicher Sprache und die Qualität der Begründung bleiben Modellleistung. Bei jeder Planung werden Aufgaben, Check-in, Präferenzen und Nachricht an die Google-API gesendet.

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
