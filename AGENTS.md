# Regeln für alle Coding-Agenten

## Auftrag und Quellen

- Lies diese Datei und `README.md` vor Änderungen. Der konkrete Nutzerauftrag bestimmt den Umfang.
- Der aktuelle technische Stand und die Startbefehle stehen in `README.md`. `docs/cooperation-test.md` beschreibt den ursprünglichen Kooperationstest und ist kein neuer Produktauftrag.
- Produktquelle ist der Abschnitt **Chat Core Features** auf der in `README.md` verlinkten Notion-Teamseite. Optionale oder spätere Integrationen sind kein automatischer Implementierungsauftrag.
- WHOOP und weitere Wearable-Integrationen bleiben vorerst außerhalb des Umfangs. Spätere Featureaufträge konzentrieren sich zunächst auf die Kernfunktionalität.
- Ist Notion nicht zugänglich oder eine Anforderung widersprüchlich, benenne die konkrete Lücke. Erfinde keine Anforderungen und ersetze die Quelle nicht durch Vermutungen.

## Dokumentation ohne Bloat

- Dokumentiere nur bestätigte Entscheidungen, überprüfbare Einrichtung und tatsächlich vorhandenes Verhalten. Ein Merge belegt keine fachliche Richtigkeit.
- Ideen und Brainstorming bleiben in Notion. Keine kopierte Feature-Wunschliste, spekulative Architektur oder vorsorglichen Ordner im Repo.
- Ungeklärtes steht ausschließlich in `docs/open-questions.md`, ausdrücklich als offen markiert. Ein offener Punkt ist keine Arbeitsfreigabe.
- Ergänze technische Dokumentation erst, wenn die entsprechende Implementierung oder eine bestätigte Entscheidung existiert. Halte sie kurz und ändere bestehende Abschnitte statt paralleler Zusammenfassungen.
- Arbeitsstatus, Prüfbelege und Übergaben gehören in den jeweiligen PR. Keine Agententagebücher, Test-Quittungen oder dauerhaften Statusdateien.
- Übernimm aus Notion nur die für den konkreten Auftrag bestätigten Anforderungen mit Quellenlink; nicht die ganze Seite. Aktualisiere relevante Doku im selben PR wie die Änderung.

## Parallele Arbeit

- Jede Instanz nutzt einen eigenen lokalen Klon oder Worktree und einen eigenen Branch ab dem aktuellen `origin/main`.
- Bearbeite nur den zugewiesenen Bereich. Stimme notwendige Änderungen an gemeinsamen Schnittstellen mit den beteiligten Instanzen ab.
- Kleine, zusammenhängende PRs. Keine fremden Änderungen überschreiben, keine Force-Pushes, kein Push auf `main`.
- Alle Teammitglieder mit GitHub-Schreibrechten und ihre beauftragten Instanzen dürfen PRs im bestätigten Auftragsumfang nach `main` mergen; eine gesonderte Freigabe durch Finn ist dafür nicht nötig. Vor jedem Merge Diff, Umfang, aktuellen PR-Head und vorhandene Checks prüfen. Kein ungeprüftes Auto-Merge und kein Umgehen von Schutzregeln.
- Diese Regeln und CODEOWNERS ersetzen keine technisch konfigurierte Branch Protection.
- Wenn Schreibrechte fehlen, nutze einen Fork und einen PR zum Ursprungsrepo. Teile keine Logins oder Tokens.

## Prüfung und Sicherheit

- Prüfe vor dem Commit mindestens `git diff --check` und den vollständigen Diff; vor dem PR zusätzlich den Branch-Diff gegen `origin/main`.
- Prüfe bei reinen Dokuänderungen relative Links und Befehle auf Plausibilität. Bei App-Änderungen `npm test`, `npm run build` und `npm run format:check` ausführen; `build` enthält die Typprüfung. Ergebnisse und fehlende oder fehlgeschlagene Prüfungen im PR nennen.
- Keine Schlüssel, Tokens, Env-Dateien (auch benannte Dateien wie `GEMMA.env`), personenbezogenen Testdaten oder lokalen Claude-Einstellungen committen. `GEMMA.env` ist ausschließlich lokale Konfiguration; ihren Inhalt nicht in Chats, PRs, Logs oder Doku ausgeben. Verwende für Demos synthetische Daten.
- Bei Authentifizierungsfehlern ist die Anmeldung durch die jeweilige Person nötig. Keine Zugangsdaten aus fremden Konfigurationen übernehmen.

## Vercel-Kompatibilität

- Änderungen müssen lokal und im bestehenden Vercel-Projekt `hacktober-daylight` funktionieren. `main` ist der Produktionsbranch; vor der Integration gegen den aktuellen `origin/main` prüfen, damit vorhandene Deployment-Fixes erhalten bleiben.
- Behalte die gemeinsame Express-App und die Funktions-Einstiege unter `api/` bei. Relative Imports und Re-Exports im von Node geladenen Code (`api/`, `server/`, dort verwendete `shared/`-Module) benötigen explizite `.js`-Endungen. Ein erfolgreicher Vite-Build allein belegt keine funktionierende API-Laufzeit.
- Beachte `vercel.json`, die Node-Version des Projekts, Funktionslaufzeiten und die Trennung von Browser- und Servercode. Keine dauerhaften Prozesse oder lokale Dateien als persistente Speicherung voraussetzen. API-Schlüssel ausschließlich serverseitig halten; keine `VITE_`-Secrets.
- Vor einem Merge vorhandene Vercel-Checks für den geprüften PR-Head abwarten und bei Laufzeitänderungen die Preview samt betroffener API prüfen. Eine fehlende Fork-Freigabe ist ein Berechtigungsproblem, kein Buildfehler: den geprüften Commit gezielt über den Vercel-Link freigeben lassen. Schutzregeln nicht abschalten und einen roten Check nicht als bestanden darstellen. Ablauf und Prüfumfang stehen in `docs/workflow.md`.
