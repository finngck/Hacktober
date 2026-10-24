import { useState } from 'react';
import { CodeSquareIcon, GitBranchIcon, GitCommitIcon } from '@hugeicons/core-free-icons';
import { versionsSchema, type Versions } from '../../shared/versions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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

function VersionList({
  title,
  entries,
  empty,
}: {
  title: string;
  entries: { key: string; title: string; detail: string; url: string; action: string }[];
  empty: string;
}) {
  return (
    <section className="grid gap-2">
      <h3 className="font-semibold">{title}</h3>
      {entries.length ? (
        <ul className="grid gap-1">
          {entries.map((entry) => (
            <li
              key={entry.key}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-muted"
            >
              <span className="grid min-w-0">
                <span className="truncate font-medium">{entry.title}</span>
                <span className="text-xs text-muted-foreground">{entry.detail}</span>
              </span>
              <a
                href={entry.url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-sm text-primary underline-offset-4 hover:underline"
              >
                {entry.action}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

export function VersionMenu() {
  const [versions, setVersions] = useState<Versions | null>(null);
  const [loading, setLoading] = useState(false);
  async function load() {
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
    <Dialog onOpenChange={(open) => open && void load()}>
      <DialogTrigger
        render={<Button variant="ghost" aria-label="Versionen und Entwicklungsstand" />}
      >
        <Icon icon={CodeSquareIcon} size={18} />
        Versionen
      </DialogTrigger>
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Versionen & Entwicklung</DialogTitle>
          <DialogDescription>Der Stand, den du gerade geöffnet hast.</DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-5">
          <div className="grid gap-1 rounded-xl bg-muted p-3 text-sm">
            <div className="flex items-center gap-2">
              <strong className="font-heading text-base">Pivot {build.version}</strong>
              <Badge variant="outline">
                {build.environment === 'production'
                  ? 'Live'
                  : build.environment === 'preview'
                    ? 'Vorschau'
                    : 'Lokal'}
              </Badge>
            </div>
            <p className="flex items-center gap-2">
              <Icon icon={GitBranchIcon} size={16} />
              {build.branch || 'Branch unbekannt'}
            </p>
            <p className="flex items-center gap-2">
              <Icon icon={GitCommitIcon} size={16} />
              {build.commit ? (
                <a
                  href={`${build.repository}/commit/${build.commit}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {build.commit.slice(0, 7)}
                </a>
              ) : (
                'Commit unbekannt'
              )}
              {build.dirty && <span className="text-muted-foreground">mit lokalen Änderungen</span>}
            </p>
            <small className="text-muted-foreground">Gebaut am {date(build.builtAt)} Uhr</small>
          </div>
          {loading ? (
            <p role="status" className="text-sm text-muted-foreground">
              Versionsverlauf wird geladen …
            </p>
          ) : (
            <>
              <VersionList
                title="Verfügbare Deployments"
                entries={(versions?.deployments ?? []).map((entry) => ({
                  key: String(entry.id),
                  title: entry.environment,
                  detail: `${entry.sha.slice(0, 7)} · ${date(entry.date)}`,
                  url: entry.url,
                  action: 'Version öffnen',
                }))}
                empty={
                  versions?.available
                    ? 'Noch keine erfolgreichen Deployments im GitHub-Verlauf.'
                    : 'Der Deployment-Verlauf ist gerade nicht verfügbar.'
                }
              />
              <VersionList
                title="Neueste Änderungen auf main"
                entries={(versions?.commits ?? []).map((entry) => ({
                  key: entry.sha,
                  title: entry.message,
                  detail: `${entry.sha.slice(0, 7)} · ${date(entry.date)}`,
                  url: entry.url,
                  action: 'Code ansehen',
                }))}
                empty="Den vollständigen Verlauf findest du auf GitHub."
              />
            </>
          )}
        </DialogPanel>
        <DialogFooter>
          <Button
            variant="outline"
            render={<a href={build.repository} target="_blank" rel="noreferrer" />}
          >
            <Icon icon={CodeSquareIcon} size={17} />
            Repository öffnen
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
