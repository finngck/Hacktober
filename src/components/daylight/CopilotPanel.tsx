import { useEffect, useRef, type FormEvent, type RefObject } from 'react';
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
          What changed?
        </h2>
        <p className="text-sm text-muted-foreground">
          Describe it in one sentence. Pivot sorts out the rest.
        </p>
      </div>
      <form onSubmit={onSubmit} className="grid gap-2">
        <label htmlFor="change-message" className="sr-only">
          Change to your day plan
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
          placeholder="My train is delayed and I slept badly …"
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
            {health ? (health.configured ? 'Gemma 4 ready' : 'API key missing') : 'Connecting …'}
          </span>
          <div className="flex items-center gap-2">
            <KbdGroup className="max-sm:hidden">
              <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
              <Kbd>↵</Kbd>
            </KbdGroup>
            {busy ? (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Button type="submit">Replan day</Button>
            )}
          </div>
        </div>
      </form>

      {!response && !busy && (
        <div className="grid gap-2">
          <span className="text-xs text-muted-foreground">Try it out</span>
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
              Weighing your appointments, tasks, and check-in together …
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
          <AlertTitle>That didn't work</AlertTitle>
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
                ? "Here's what I'd change"
                : result.status === 'conflict'
                  ? "This doesn't fit together yet"
                  : 'A quick question'}
            </h3>
            <p className="text-sm">{result.summary}</p>
            {result.question && <p className="font-medium">{result.question}</p>}
          </div>
          <EnergyMeasures measures={response.measures} />

          {response.proposedPlan ? (
            <>
              <ul className="flex flex-wrap gap-1.5 text-xs" aria-label="What I understood">
                <li className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                  <Icon icon={Clock01Icon} size={14} />
                  From {formatTime(result.availabilityFrom)}
                </li>
                <li className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                  <Icon icon={Moon02Icon} size={14} />
                  {formatHours(result.sleepHours)}
                </li>
                <li className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                  <Icon icon={BatteryMedium01Icon} size={14} />
                  Energy {energyLevelLabels[energyLevelOf(result) - 1].toLowerCase()}
                </li>
              </ul>
              <p className="text-sm text-muted-foreground">
                {changedItems.length === 0
                  ? 'No times change.'
                  : `${changedItems.length} ${changedItems.length === 1 ? 'block changes' : 'blocks change'}. See the details in your day plan.`}{' '}
                Your current plan stays until you apply.
              </p>
              <div className="grid grid-cols-[1fr_2fr] gap-2">
                <Button variant="outline" onClick={onDiscard}>
                  Discard
                </Button>
                <Button onClick={onAccept}>
                  <Icon icon={Tick02Icon} size={18} />
                  Apply plan
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
                Add details
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Created with {response.meta.model} in {(response.meta.elapsedMs / 1000).toFixed(1)} s.
            You decide: nothing changes without your confirmation.
          </p>
        </div>
      )}
    </section>
  );
}
