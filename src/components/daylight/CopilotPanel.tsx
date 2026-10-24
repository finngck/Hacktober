import { useEffect, useRef, type FormEvent, type RefObject, type ReactNode } from 'react';
import {
  Alert02Icon,
  Clock01Icon,
  Moon02Icon,
  SparklesIcon,
  Tick02Icon,
  BatteryMedium01Icon,
} from '@hugeicons/core-free-icons';
import {
  energyLevelLabels,
  energyLevelOf,
  formatTime,
  type ReplanResponse,
  type ScheduleItem,
} from '../../../shared/contracts';
import { demoPrompts } from '../../../shared/demo';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Icon } from '../Icon';
import { formatHours } from './checkInOptions';
import { EnergyMeasures } from './EnergyMeasures';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function CopilotPanel({
  message,
  onMessageChange,
  onSubmit,
  onCancel,
  busy,
  error,
  health,
  response,
  changedItems,
  onAccept,
  onDiscard,
  textareaRef,
  voiceControl,
}: {
  message: string;
  onMessageChange: (message: string) => void;
  onSubmit: (event?: FormEvent) => void;
  onCancel: () => void;
  busy: boolean;
  error: string;
  health: { configured: boolean; model: string } | null;
  response: ReplanResponse | null;
  changedItems: ScheduleItem[];
  onAccept: () => void;
  onDiscard: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  voiceControl?: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const result = response?.result;
  useEffect(() => {
    // Move focus to the answer so keyboard and screen reader users land on it.
    if (response) heading.current?.focus();
  }, [response]);
  return (
    <section
      className="grid content-start gap-4 rounded-xl border bg-card p-4 shadow-xs/5"
      aria-labelledby="copilot-title"
    >
      <div>
        <h2 id="copilot-title" className="text-base font-semibold">
          Was hat sich geändert?
        </h2>
        <p className="text-sm text-muted-foreground">
          Beschreib es in einem Satz. Pivot sortiert den Rest.
        </p>
      </div>
      <form onSubmit={onSubmit} className="grid gap-2">
        <label htmlFor="change-message" className="sr-only">
          Änderung für deinen Tagesplan
        </label>
        <Textarea
          ref={textareaRef}
          id="change-message"
          rows={3}
          maxLength={2000}
          disabled={busy}
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !busy) {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Mein Zug ist verspätet und ich habe schlecht geschlafen …"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
            <span
              className={cn(
                'size-2 rounded-full',
                health?.configured
                  ? 'bg-success'
                  : health
                    ? 'bg-warning'
                    : 'bg-muted-foreground/40',
              )}
            />
            {health ? (health.configured ? 'Gemma 4 bereit' : 'API-Key fehlt') : 'Verbindung …'}
          </span>
          <div className="flex items-center gap-2">
            <KbdGroup className="max-sm:hidden">
              <Kbd>{isMac ? '⌘' : 'Strg'}</Kbd>
              <Kbd>↵</Kbd>
            </KbdGroup>
            {busy ? (
              <Button type="button" variant="outline" onClick={onCancel}>
                Abbrechen
              </Button>
            ) : (
              <Button type="submit">Tag neu planen</Button>
            )}
          </div>
        </div>
      </form>
      {voiceControl}

      {!response && !busy && (
        <div className="grid gap-2">
          <span className="text-xs text-muted-foreground">Zum Ausprobieren</span>
          <div className="flex flex-wrap gap-1.5">
            {demoPrompts.map((prompt) => (
              <Button
                key={prompt.label}
                size="sm"
                variant="secondary"
                className="rounded-full"
                onClick={() => {
                  onMessageChange(prompt.message);
                  textareaRef.current?.focus();
                }}
              >
                {prompt.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div aria-live="polite" className="contents">
        {busy && (
          <div className="grid gap-2" role="status">
            <p className="text-sm text-muted-foreground">
              Termine, Aufgaben und dein Check-in werden zusammen betrachtet …
            </p>
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
      </div>

      {error && (
        <Alert variant="error">
          <Icon icon={Alert02Icon} size={18} />
          <AlertTitle>Das hat nicht geklappt</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && response && (
        <div className="grid animate-rise gap-4 border-t pt-4">
          <div className="grid gap-1">
            <h3
              ref={heading}
              id="proposal-title"
              tabIndex={-1}
              className="flex items-center gap-2 text-lg font-semibold outline-none"
            >
              <Icon
                icon={result.status === 'proposal' ? SparklesIcon : Alert02Icon}
                size={20}
                className={
                  result.status === 'proposal' ? 'text-foreground' : 'text-warning-foreground'
                }
              />
              {result.status === 'proposal'
                ? 'Das würde ich ändern'
                : result.status === 'conflict'
                  ? 'Das passt noch nicht zusammen'
                  : 'Eine kurze Rückfrage'}
            </h3>
            <p className="text-sm">{result.summary}</p>
            {result.question && <p className="font-medium">{result.question}</p>}
          </div>
          <EnergyMeasures measures={response.measures} />

          {response.proposedPlan ? (
            <>
              <ul
                className="flex flex-wrap gap-1.5 text-xs"
                aria-label="So habe ich dich verstanden"
              >
                <li className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                  <Icon icon={Clock01Icon} size={14} />
                  Ab {formatTime(result.availabilityFrom)}
                </li>
                <li className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                  <Icon icon={Moon02Icon} size={14} />
                  {formatHours(result.sleepHours)}
                </li>
                <li className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                  <Icon icon={BatteryMedium01Icon} size={14} />
                  Energie {energyLevelLabels[energyLevelOf(result) - 1].toLowerCase()}
                </li>
              </ul>
              <p className="text-sm text-muted-foreground">
                {changedItems.length === 0
                  ? 'Keine Zeit ändert sich.'
                  : `${changedItems.length} ${changedItems.length === 1 ? 'Block ändert sich' : 'Blöcke ändern sich'}. Die Details siehst du im Tagesplan.`}{' '}
                Dein bisheriger Plan gilt, bis du übernimmst.
              </p>
              <div className="grid grid-cols-[1fr_2fr] gap-2">
                <Button variant="outline" onClick={onDiscard}>
                  Verwerfen
                </Button>
                <Button onClick={onAccept}>
                  <Icon icon={Tick02Icon} size={18} />
                  Plan übernehmen
                </Button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  onDiscard();
                  textareaRef.current?.focus();
                }}
              >
                Nachricht ergänzen
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Mit {response.meta.model} in {(response.meta.elapsedMs / 1000).toFixed(1)} s erstellt.
            Du entscheidest, nichts ändert sich ohne deine Bestätigung.
          </p>
        </div>
      )}
    </section>
  );
}
