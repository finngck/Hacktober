# Regeln für alle Coding-Agenten

## Auftrag und Quellen

- Lies diese Datei und `README.md` vor Änderungen. Der konkrete Nutzerauftrag bestimmt den Umfang.
- Der erste Arbeitsauftrag ist ausschließlich der Kooperationstest in `docs/cooperation-test.md`. Implementiere dabei keine Produktfeatures und installiere keinen App-Stack.
- Produktquelle ist der Abschnitt **Chat Core Features** auf der in `README.md` verlinkten Notion-Teamseite. Optionale oder spätere Integrationen sind kein automatischer Implementierungsauftrag.
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
- Bearbeite nur den zugewiesenen Bereich. Stimme notwendige Änderungen an gemeinsamen Schnittstellen mit Finns Integrationsinstanz ab.
- Kleine, zusammenhängende PRs. Keine fremden Änderungen überschreiben, keine Force-Pushes, kein Push auf `main`.
- Nur Finns beauftragte Instanz führt PRs zusammen. Sie prüft Diff, Umfang, aktuellen PR-Head und vorhandene Checks. Kein ungeprüftes Auto-Merge und kein Umgehen von Schutzregeln.
- Diese Regeln und CODEOWNERS ersetzen keine technisch konfigurierte Branch Protection.
- Wenn Schreibrechte fehlen, nutze einen Fork und einen PR zum Ursprungsrepo. Teile keine Logins oder Tokens.

## Prüfung und Sicherheit

- Prüfe vor dem Commit mindestens `git diff --check` und den vollständigen Diff; vor dem PR zusätzlich den Branch-Diff gegen `origin/main`.
- Prüfe bei reinen Dokuänderungen relative Links und Befehle auf Plausibilität. Es gibt derzeit keine App-Tests; behaupte keine erfolgreichen Build- oder Laufzeittests.
- Sobald App-Code existiert, verwende die tatsächlich im Repo definierten Prüfungen und dokumentiere ihre Ergebnisse im PR. Fehlende oder fehlgeschlagene Prüfungen offen nennen.
- Keine Schlüssel, Tokens, `.env`-Dateien, personenbezogenen Testdaten oder lokalen Claude-Einstellungen committen. Verwende für Demos synthetische Daten.
- Bei Authentifizierungsfehlern ist die Anmeldung durch die jeweilige Person nötig. Keine Zugangsdaten aus fremden Konfigurationen übernehmen.
