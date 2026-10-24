# Arbeitsablauf

## Rollen und Zugriff

Jede Person nutzt ihre eigene GitHub-Anmeldung und eine getrennte Arbeitskopie. Alle Teammitglieder mit GitHub-Schreibrechten und ihre beauftragten Instanzen dürfen PRs im bestätigten Auftragsumfang nach Prüfung integrieren; eine gesonderte Freigabe durch Finn ist nicht nötig. Anmeldung, Commit-Identität und Schreibrechte vor dem ersten Push prüfen:

```sh
gh auth status
gh api user --jq .login
git var GIT_AUTHOR_IDENT
gh api repos/finngck/Hacktober --jq .permissions
```

Ein öffentlicher Klon beweist nur Lesezugriff. Push und PR-Erstellung werden durch den Kooperationstest geprüft. Bei fehlender oder abgelaufener Anmeldung führt die jeweilige Person `gh auth login` aus. Bei reinen Leserechten einen eigenen Fork verwenden; keine zusätzlichen Rechte oder Zugangsdaten voraussetzen.

## Branch und Pull Request

1. In einem sauberen Klon `git fetch origin` ausführen und einen eigenen Branch ab `origin/main` erstellen.
2. Nur den vereinbarten Bereich bearbeiten. `git diff --check`, den Diff und betroffene relative Links prüfen.
3. Nur die zugewiesenen Dateien stagen und committen. Den Branch pushen; bei einem Fork zum eigenen Remote pushen.
4. Einen PR mit Ziel `finngck/Hacktober:main` erstellen. Ergebnis, ausgeführte Prüfungen und offene Einschränkungen knapp nennen. Für mehrzeilige Beschreibungen `gh pr create --body-file` verwenden.
5. Den PR nach den untenstehenden Regeln selbst integrieren oder den PR-Link an eine beauftragte Instanz mit Schreibrechten übergeben. Andere Instanzen erhalten Code erst durch Push und Fetch/Pull; ihre Chats werden nicht automatisch synchronisiert.

Vor der Übergabe den eigenen Arbeitsbranch bei sauberem Arbeitsstand auf den aktuellen `main` bringen:

```sh
git fetch origin
git merge origin/main
```

Konflikte im eigenen Zuständigkeitsbereich selbst lösen, bei gemeinsamen Schnittstellen mit den beteiligten Instanzen abstimmen. Danach erneut prüfen und normal pushen; kein Force-Push.

Bei fehlenden Schreibrechten: `gh repo fork finngck/Hacktober --clone=false` nutzen, den eigenen Fork als weiteres Remote hinzufügen und den eigenen Branch dorthin pushen. Den PR mit `--repo finngck/Hacktober --head EIGENER_LOGIN:BRANCH` erstellen.

## PRs prüfen und integrieren

- PR-Head, vollständigen Diff, Dateiumfang und vorhandene Checks lesen. Fakten und Annahmen müssen getrennt sein. Offene Fehler zuerst beheben lassen.
- Nur PRs im bestätigten Auftragsumfang integrieren. Im Kooperationstest sind das ausschließlich die vier in [den Startaufträgen](cooperation-test.md) definierten Branches und Änderungen.
- Bei App-Änderungen `npm test`, `npm run build` und `npm run format:check` ausführen. Sofern Remote-Checks vorhanden sind, auf deren erfolgreichen Abschluss für den geprüften Head warten. Dokuprüfungen und nicht ausgeführte Prüfungen im PR benennen.
- Einen geprüften PR mit Squash und dem geprüften Head-SHA mergen: `gh pr merge NUMMER --repo finngck/Hacktober --squash --match-head-commit GEPRUEFTER_SHA`. Kein `--admin` und kein blindes Auto-Merge.
- Danach den gemergten Stand holen und den kombinierten Diff prüfen. Neue Produktarbeit beginnt erst mit einem eigenen Auftrag und Abnahmekriterien.

## Vercel vor und nach dem Merge

1. Gegen den aktuellen `origin/main` prüfen; frühere ESM- und Deployment-Fixes nicht durch einen alten Featurebranch überschreiben. `vercel.json` baut die Vite-Oberfläche nach `dist/`; `api/` delegiert an dieselbe Express-App wie der lokale Server. Relative Node-Imports und Re-Exports behalten explizite `.js`-Endungen.
2. Den Vercel-Check des aktuellen PR-Heads lesen. Bei Forks kann Vercel vor dem Build eine Freigabe verlangen. Ein berechtigtes Teammitglied prüft den Diff und genehmigt genau diesen Commit über den Link im Vercel-Bot-Kommentar. Git Fork Protection bleibt aktiv; bei fehlendem Zugang den konkreten Blocker melden. [Vercel-Dokumentation zu Fork-Freigaben](https://vercel.com/docs/git/vercel-for-github#deployment-authorizations-for-forks).
3. Bei API-Änderungen zusätzlich zur erfolgreichen Preview `/api/health` und den betroffenen Endpunkt prüfen. Für `/api/replan` ausschließlich synthetische Plandaten und den erwarteten Origin verwenden; Modellaufrufe verbrauchen Kontingent. Ohne eingerichteten Key keinen erfolgreichen Modelltest behaupten. Ein grüner Frontend-Build schließt Fehler wie `ERR_MODULE_NOT_FOUND` in Node-Funktionen nicht aus.
4. Nach dem geprüften Squash-Merge das automatische Produktionsdeployment von `main` abwarten, Commit und Status abgleichen und betroffene API-Funktionen erneut prüfen. Bei Fehlern Logs lesen und die konkrete Ursache beheben; keinen erfolgreichen Release behaupten, solange der Laufzeitcheck fehlschlägt.

## Spätere MVP-Arbeit

Jeder Featureauftrag nennt Ziel, Quelle, Abnahmekriterien, bearbeitete Bereiche und nötige Schnittstellen. Erweiterungen und Überarbeitungen folgen als kleine weitere PRs. Funktionierende Beispiele und Startbefehle werden mit dem ersten App-Code ergänzt.
