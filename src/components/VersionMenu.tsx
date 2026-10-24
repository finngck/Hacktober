import { useRef, useState } from 'react';
import {
  CodeSquareIcon,
  Cancel01Icon,
  GitBranchIcon,
  GitCommitIcon,
} from '@hugeicons/core-free-icons';
import { versionsSchema, type Versions } from '../../shared/versions';
import { Icon } from './Icon';

const build = __BUILD_INFO__;
const date = (value: string) =>
  new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  }).format(new Date(value));

export function VersionMenu() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [versions, setVersions] = useState<Versions | null>(null);
  const [loading, setLoading] = useState(false);
  async function open() {
    dialog.current?.showModal();
    if (versions || loading) return;
    setLoading(true);
    try {
      const response = await fetch('/api/versions');
      if (!response.ok) throw new Error('Verlauf nicht verfügbar.');
      setVersions(versionsSchema.parse(await response.json()));
    } catch {
      setVersions({ commits: [], deployments: [], available: false });
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <button
        className="button quiet versions-trigger"
        aria-label="Versionen und Entwicklungsstand"
        onClick={open}
      >
        <Icon icon={CodeSquareIcon} size={18} />
        <span>Versionen</span>
      </button>
      <dialog ref={dialog} className="version-dialog" aria-labelledby="versions-title">
        <div className="dialog-heading">
          <div>
            <h2 id="versions-title">Versionen & Entwicklung</h2>
            <p>Der Stand, den du gerade geöffnet hast.</p>
          </div>
          <button
            className="icon-button"
            aria-label="Versionsmenü schließen"
            onClick={() => dialog.current?.close()}
          >
            <Icon icon={Cancel01Icon} />
          </button>
        </div>
        <div className="current-version">
          <div className="version-title">
            <strong>Pivot {build.version}</strong>
            <span>
              {build.environment === 'production'
                ? 'Live'
                : build.environment === 'preview'
                  ? 'Vorschau'
                  : 'Lokal'}
            </span>
          </div>
          <p>
            <Icon icon={GitBranchIcon} size={16} />
            {build.branch || 'Branch unbekannt'}
          </p>
          <p>
            <Icon icon={GitCommitIcon} size={16} />
            {build.commit ? (
              <a
                href={`${build.repository}/commit/${build.commit}`}
                target="_blank"
                rel="noreferrer"
              >
                {build.commit.slice(0, 7)}
              </a>
            ) : (
              'Commit unbekannt'
            )}
            {build.dirty && <span>mit lokalen Änderungen</span>}
          </p>
          <small>Gebaut am {date(build.builtAt)} Uhr</small>
        </div>
        <section className="version-section">
          <h3>Verfügbare Deployments</h3>
          {loading ? (
            <p role="status">Versionsverlauf wird geladen …</p>
          ) : versions?.deployments.length ? (
            <ul>
              {versions.deployments.map((entry) => (
                <li key={entry.id}>
                  <div>
                    <strong>{entry.environment}</strong>
                    <span>
                      {entry.sha.slice(0, 7)} · {date(entry.date)}
                    </span>
                  </div>
                  <a href={entry.url} target="_blank" rel="noreferrer">
                    Version öffnen
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {versions?.available
                ? 'Noch keine erfolgreichen Deployments im GitHub-Verlauf.'
                : 'Der Deployment-Verlauf ist gerade nicht verfügbar.'}
            </p>
          )}
        </section>
        <section className="version-section">
          <h3>Neueste Änderungen auf main</h3>
          {versions?.commits.length ? (
            <ul>
              {versions.commits.map((entry) => (
                <li key={entry.sha}>
                  <div>
                    <strong>{entry.message}</strong>
                    <span>
                      {entry.sha.slice(0, 7)} · {date(entry.date)}
                    </span>
                  </div>
                  <a href={entry.url} target="_blank" rel="noreferrer">
                    Code ansehen
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {loading
                ? 'Änderungen werden geladen …'
                : 'Den vollständigen Verlauf findest du auf GitHub.'}
            </p>
          )}
        </section>
        <a
          className="button secondary version-repo-link"
          href={build.repository}
          target="_blank"
          rel="noreferrer"
        >
          <Icon icon={CodeSquareIcon} size={17} />
          Repository öffnen
        </a>
      </dialog>
    </>
  );
}
