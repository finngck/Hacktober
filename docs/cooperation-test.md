# Kooperationstest: vier Claude-Code-Instanzen

**Auftrag:** Nur Klonen, Zugriff, getrennte Branches, kleine Doku-PRs und Integration testen. Keine Produktfeatures, Dependencies, App-Gerüste oder Übernahme von Brainstorming.

Prompt 1 gehört in Finns Instanz, Prompts 2–4 jeweils in eine andere Instanz. Jede Person kopiert ihren ganzen Prompt. Die Aufgaben bearbeiten getrennte Dateien. Die Anmeldung muss auf jedem Rechner separat funktionieren; ein Login in einer anderen App reicht dafür nicht aus.

**Erfolg:** Vier echte PRs sind im Ursprungsrepo erstellt, von Finns Instanz geprüft und gemergt. Jede Instanz kann den gemeinsamen Stand holen. Ein erfolgreicher öffentlicher Klon allein genügt nicht. Belege bleiben in den PRs; diese einmaligen Startaufträge können nach dem Test gelöscht werden.

## Prompt 1 — Finn: eigener Test-PR und Integration

```text
Du bist meine Integrationsinstanz für https://github.com/finngck/Hacktober.
Dies ist nur ein Kooperationstest, kein Featureauftrag.

1. Klone das Repo lokal in einen neuen, geeigneten Ordner, z. B.:
   git clone https://github.com/finngck/Hacktober.git Hacktober-integrator
   Nutze bei vorhandenem Klon nur die passende, saubere Arbeitskopie;
   überschreibe keine fremden oder uncommitteten Änderungen.
2. Lies AGENTS.md, README.md, docs/workflow.md und diesen Testauftrag.
   Prüfe gh auth status, gh api user --jq .login und die Repo-Rechte.
   Wenn die Anmeldung fehlt, lass mich gh auth login abschließen.
   Teile keine Zugangsdaten. Prüfe auch git var GIT_AUTHOR_IDENT.
3. Hole origin/main und erstelle davon chore/cooperation-01-integrator.
   Erstelle ausschließlich .github/CODEOWNERS mit diesem Inhalt:
   * @finngck
   Die Datei weist Reviews zu; behaupte keine erzwungene Branch Protection.
4. Prüfe den vollständigen Diff und git diff --check. Committe nur
   .github/CODEOWNERS, pushe den Branch und erstelle einen PR nach main
   in finngck/Hacktober. Titel: chore: define repository review owner
   Nutze die PR-Vorlage; beschreibe nur wirklich ausgeführte Prüfungen.
5. Prüfe auch deinen eigenen PR vor dem Merge. Integriere ihn und
   ausschließlich die folgenden drei Test-PRs, sobald deren Links vorliegen:
   - chore/cooperation-02-readme: nur README.md, sauberer Main-Abgleich.
   - chore/cooperation-03-workflow: nur docs/workflow.md, Branch aktualisieren.
   - chore/cooperation-04-template: nur .github/pull_request_template.md,
     ein Doku-/Quellen-Checkboxpunkt.
   Bei Forks stimmen Branchname und Auftrag, der Head liegt im eigenen Fork.
6. Lies für jeden PR den aktuellen Head-SHA und den vollständigen Diff.
   Prüfe Umfang, Fakten, Links, Mergefähigkeit und vorhandene Checks.
   Merge nur erfolgreiche, passende PRs mit --squash und
   --match-head-commit auf den geprüften SHA. Kein --admin, kein Auto-Merge.
   Überspringe fremde PRs. Lasse Fehler zuerst in der zuständigen Instanz
   beheben; erfinde keine Freigaben.
7. Hole den gemeinsamen main-Stand nach den Merges und prüfe die vier
   Änderungen zusammen. Berichte PR-Links, tatsächlichen Mergestatus und
   offene Blocker hier im Chat. Keine Statusdateien im Repo anlegen.

Falls PRs noch fehlen, melde den konkreten Stand und warte auf deren Links.
Starte keine Features, installiere keinen Stack und erfinde keine Tests.
```

## Prompt 2 — README und lokaler Einstieg

```text
Teste mit mir die Zusammenarbeit an https://github.com/finngck/Hacktober.
Nur ein kleiner Dokumentations-PR, keine Features oder Dependencies.

1. Klone das Repo lokal in einen neuen, geeigneten Ordner, z. B.:
   git clone https://github.com/finngck/Hacktober.git Hacktober-readme
   Bei vorhandenem Klon Remotes und sauberen Zustand prüfen; nichts resetten.
2. Lies AGENTS.md, README.md und docs/workflow.md. Prüfe gh auth status,
   gh api user --jq .login, git var GIT_AUTHOR_IDENT und die Repo-Rechte.
   Bei fehlender Anmeldung die Person gh auth login ausführen lassen.
3. Aktualisiere in deinem sauberen Klon main mit git switch main und
   git pull --ff-only origin main. Erstelle davon den Branch
   chore/cooperation-02-readme. Bei fehlenden Schreibrechten nutze deinen
   eigenen Fork wie in docs/workflow.md beschrieben.
4. Bearbeite ausschließlich README.md. Ergänze einen kurzen Abschnitt
   zum Aktualisieren einer sauberen Arbeitskopie:
   git switch main
   git pull --ff-only origin main
   Sage dazu, laufende Arbeit zuerst auf dem eigenen Branch zu sichern.
   Erfinde keine Installations- oder Startbefehle.
5. Prüfe git diff --check, den gesamten Branch-Diff und relative Links.
   Stage nur README.md, committe und pushe deinen Branch. Erstelle einen
   PR nach finngck/Hacktober:main mit dem Titel:
   docs: explain clean local main updates
   Nutze die vorhandene PR-Vorlage und echte Prüfergebnisse; für die
   Beschreibung eine temporäre Datei und gh pr create --body-file nutzen.
6. Gib PR-Link und etwaige Zugriffsprobleme hier aus. Merge nicht selbst.
   Finns Instanz übernimmt die Integration. Hole nach deren Merge den
   gemeinsamen Stand; bestätige erst dann, dass deine Änderung enthalten ist.

Keine weiteren Dateien, Produktideen, Statuslogs oder Featureänderungen.
```

## Prompt 3 — Arbeitsbranch aktuell halten

```text
Teste mit mir die Zusammenarbeit an https://github.com/finngck/Hacktober.
Nur ein kleiner Dokumentations-PR, keine Features oder Dependencies.

1. Klone das Repo lokal in einen neuen, geeigneten Ordner, z. B.:
   git clone https://github.com/finngck/Hacktober.git Hacktober-workflow
   Bestehende Ordner nur bei richtigem Remote und sauberem Zustand nutzen.
2. Lies AGENTS.md, README.md und docs/workflow.md. Prüfe gh auth status,
   gh api user --jq .login, git var GIT_AUTHOR_IDENT und Repo-Rechte.
   Bei fehlender Anmeldung die Person gh auth login ausführen lassen.
3. Erstelle ab aktuellem origin/main chore/cooperation-03-workflow.
   Wenn direkte Schreibrechte fehlen, nutze den eigenen Fork gemäß Workflow.
4. Ändere ausschließlich docs/workflow.md. Ergänze knapp, wie man den
   eigenen sauberen Arbeitsbranch vor der Übergabe aktualisiert:
   git fetch origin
   git merge origin/main
   Konflikte im eigenen Zuständigkeitsbereich lösen, bei gemeinsamen
   Schnittstellen abstimmen und anschließend erneut prüfen. Kein Force-Push.
   Probiere die Befehle auf deinem Testbranch tatsächlich aus.
5. Prüfe git diff --check, den gesamten Branch-Diff und relative Links.
   Stage nur docs/workflow.md, committe, pushe und erstelle einen PR nach
   finngck/Hacktober:main. Titel: docs: explain working branch updates
   Verwende die vorhandene PR-Vorlage mit tatsächlichen Ergebnissen und
   gh pr create --body-file mit einer temporären Beschreibungsdatei.
6. Gib den PR-Link und offene Zugriffsprobleme hier aus. Merge nicht selbst;
   Finns Instanz integriert. Hole nach deren Merge den gemeinsamen Stand
   und bestätige erst dann, dass deine Änderung auf main angekommen ist.

Keine weiteren Dateien, Produktideen, Statuslogs oder Featureänderungen.
```

## Prompt 4 — Quellen- und Dokumentationsprüfung im PR

```text
Teste mit mir die Zusammenarbeit an https://github.com/finngck/Hacktober.
Nur ein kleiner Dokumentations-PR, keine Features oder Dependencies.

1. Klone das Repo lokal in einen neuen, geeigneten Ordner, z. B.:
   git clone https://github.com/finngck/Hacktober.git Hacktober-pr-template
   Bestehende Ordner nur bei richtigem Remote und sauberem Zustand nutzen.
2. Lies AGENTS.md, README.md, docs/README.md und docs/workflow.md.
   Prüfe gh auth status, gh api user --jq .login, git var GIT_AUTHOR_IDENT
   und Repo-Rechte. Bei fehlender Anmeldung die Person gh auth login
   ausführen lassen. Bei fehlenden Schreibrechten den eigenen Fork nutzen.
3. Erstelle ab aktuellem origin/main chore/cooperation-04-template.
4. Bearbeite ausschließlich .github/pull_request_template.md. Ergänze
   unter Prüfung genau einen dauerhaften, kurzen Checkboxpunkt:
   - [ ] Relevante Doku ist aktuell; Fakten, offene Fragen und Ideen sind getrennt.
   Kopiere keine Ideen aus Notion und füge keine größere Checkliste hinzu.
5. Prüfe git diff --check und den vollständigen Branch-Diff. Stage nur
   .github/pull_request_template.md, committe und pushe deinen Branch.
   Erstelle einen PR nach finngck/Hacktober:main mit dem Titel:
   docs: add documentation source check to pull requests
   Verwende die Vorlage einschließlich des neuen Punkts und tatsächliche
   Prüfergebnisse. Nutze gh pr create --body-file mit temporärer Datei.
6. Gib PR-Link und offene Zugriffsprobleme hier aus. Merge nicht selbst.
   Finns Instanz übernimmt. Hole nach deren Merge den gemeinsamen Stand
   und bestätige erst dann, dass deine Änderung auf main angekommen ist.

Keine weiteren Dateien, Produktideen, Statuslogs oder Featureänderungen.
```
