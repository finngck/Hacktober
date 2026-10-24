# Hacktober

Gemeinsames Repository für die Umsetzung der **Chat Core Features** aus der [Notion-Teamseite](https://app.notion.com/p/q-summit/Hacktoberfest-403024b9b73b80c2be88d09ff91a9d08).

## Aktueller Stand

Der lokale Daylight-Prototyp setzt den Textablauf aus **Chat Core Features** um: Beispieltag und Check-in → Änderung eingeben → Gemma-4-Vorschlag → Vorher/Nachher prüfen → übernehmen oder verwerfen. Aufgaben können ergänzt, Änderungen rückgängig gemacht und der Beispieltag zurückgesetzt werden.

Bei weniger als 7 Stunden Schlaf oder wenig Energie zeigt der Vorschlag bis zu drei Maßnahmen bzw. Maßgaben und bis zu zwei Restriktionen aus dem Maßnahmen-Pool in `shared/measures.ts`. Gemma meldet nur, was die Nachricht ausdrücklich nennt (z. B. Schläfrigkeit oder bisheriges Koffein); die Auswahl, Sperren und Ausschlüsse aus dem Check-in prüft der Code. Tagesbeginn und -ende gelten dabei als Aufwach- und Schlafenszeit.

React/TypeScript und Vite bilden die Oberfläche, Express das lokale Backend. Die Icons kommen aus HugeIcons. Beispieldaten und Demo-Uhrzeit (13:00 Uhr am 24.10.2026, Europe/Berlin) sind absichtlich synthetisch und reproduzierbar. Der Browser speichert bestätigte Pläne, Check-in und bis zu fünf Undo-Schritte lokal. Es gibt keinen Login und keine Datenbank.

Das schwebende ElevenLabs-Widget ist entfernt; die App lädt dessen externes Skript nicht mehr. Speech-to-Text im Planer, Kalender-/Wearable-Anbindungen, Screenshot-Import und Balance-Charts sind noch nicht implementiert. Ein fehlender API-Key oder eine fehlgeschlagene Modellantwort erzeugt eine sichtbare Fehlermeldung; es gibt keinen simulierten KI-Fallback. Das Versionsmenü bleibt vorerst ausgeblendet.

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
- `POST /api/extract`: `{ image (Base64), mimeType }` → `{ tasks, note, meta }`. Gemma liest Aufgaben, Termine und Fristen aus einem Screenshot (PNG, JPEG, WebP, bis etwa 2,5 MB). Die Oberfläche zeigt die Treffer zur Prüfung und Korrektur; erst die Bestätigung fügt sie dem Plan hinzu. Das Bild wird nicht gespeichert, aber zur Analyse an Google gesendet. Ob das konfigurierte Gemma-Modell Bilder verarbeitet, ist mit `npm run test:live` noch nicht geprüft.
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
