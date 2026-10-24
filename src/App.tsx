import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Undo02Icon } from '@hugeicons/core-free-icons';
import {
  replanResponseSchema,
  formatTime,
  validatePlan,
  hasItemChanged,
  type CheckIn,
  type ReplanResponse,
  type ScheduleItem,
} from '../shared/contracts';
import { freshWorkspace, loadWorkspace, saveWorkspace } from './state';
import {
  badges,
  checkedInToday,
  loadProgress,
  recordAcceptedPlan,
  recordCheckIn,
  saveProgress,
  streak,
  type BadgeId,
} from '@/lib/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';
import { toastManager } from '@/components/ui/toast';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';
import { Icon } from './components/Icon';
import { AddTask } from './components/daylight/AddTask';
import { AppHeader } from './components/daylight/AppHeader';
import { CheckInFlow } from './components/daylight/CheckInFlow';
import { CheckInSidebar } from './components/daylight/CheckInSidebar';
import { checkInMessage } from './components/daylight/checkInOptions';
import { CopilotPanel } from './components/daylight/CopilotPanel';
import { ScreenshotImport } from './components/daylight/ScreenshotImport';
import { Timeline } from './components/daylight/Timeline';
import { EnergyMeasures } from './components/daylight/EnergyMeasures';
import { VoicePanel } from './components/VoicePanel';
import { describeDay, executeVoiceReplan } from './voice-tools';

function celebrate(unlocked: BadgeId[]) {
  for (const id of unlocked)
    toastManager.add({
      type: 'success',
      title: `Abzeichen: ${badges[id].title}`,
      description: badges[id].description,
    });
}

export default function App() {
  const [workspace, setWorkspace] = useState(loadWorkspace);
  const [progress, setProgress] = useState(loadProgress);
  const [flowOpen, setFlowOpen] = useState(() => !checkedInToday(loadProgress()));
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<ReplanResponse | null>(null);
  const [voiceResult, setVoiceResult] = useState<ReplanResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [health, setHealth] = useState<{ configured: boolean; model: string } | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const requestController = useRef<AbortController | null>(null);
  const workspaceRef = useRef(workspace);
  const { plan, checkIn } = workspace;
  const proposal = response?.proposedPlan ?? null;
  const changedItems =
    proposal?.items.filter((item) =>
      hasItemChanged(
        plan.items.find((before) => before.id === item.id),
        item,
      ),
    ) ?? [];
  const fixedCount = plan.items.filter(
    (item) => item.fixed && item.start !== null && item.start >= plan.now,
  ).length;
  const dateLabel = new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: plan.timeZone,
  }).format(new Date(`${plan.date}T12:00:00+02:00`));

  useEffect(() => {
    workspaceRef.current = workspace;
    setStorageAvailable(saveWorkspace(workspace));
  }, [workspace]);
  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setHealth)
      .catch(() => {});
    return () => {
      controller.abort();
      requestController.current?.abort();
    };
  }, []);

  function clearDraft() {
    setResponse(null);
    setVoiceResult(null);
    setError('');
  }
  function changeCheckIn(patch: Partial<CheckIn>) {
    clearDraft();
    setWorkspace((previous) => ({ ...previous, checkIn: { ...previous.checkIn, ...patch } }));
  }
  function completeCheckIn(next: CheckIn) {
    changeCheckIn(next);
    const recorded = recordCheckIn(progress);
    setProgress(recorded.progress);
    return { streak: streak(recorded.progress), unlocked: recorded.unlocked };
  }
  function addTasks(items: ScheduleItem[]) {
    if (plan.items.length + items.length > 40)
      return 'Der Prototyp unterstützt bis zu 40 Aufgaben.';
    if (items.some((item) => item.start !== null && item.start < plan.now))
      return `Neue Aufgaben müssen nach der Demo-Uhrzeit ${formatTime(plan.now)} beginnen.`;
    const nextPlan = { ...plan, items: [...plan.items, ...items] };
    const issues = validatePlan(nextPlan);
    if (issues.length) return issues.join(' ');
    clearDraft();
    setWorkspace((previous) => ({
      ...previous,
      plan: nextPlan,
      history: [...previous.history, { plan: previous.plan, checkIn: previous.checkIn }].slice(-5),
    }));
    toastManager.add({
      type: 'success',
      title: items.length === 1 ? 'Aufgabe hinzugefügt' : `${items.length} Aufgaben hinzugefügt`,
      description: items.map((item) => item.title).join(', '),
    });
    return undefined;
  }
  async function runReplan(text: string) {
    if (busy || text.trim().length < 3) return;
    clearDraft();
    setBusy(true);
    const controller = new AbortController();
    requestController.current = controller;
    try {
      const result = await fetch('/api/replan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ plan, checkIn, message: text }),
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error || 'Der Plan konnte nicht erstellt werden.');
      setResponse(replanResponseSchema.parse(body));
    } catch (problem) {
      if (!controller.signal.aborted)
        setError(
          problem instanceof Error ? problem.message : 'Der Plan konnte nicht erstellt werden.',
        );
    } finally {
      setBusy(false);
      requestController.current = null;
    }
  }
  function replan(event?: FormEvent) {
    event?.preventDefault();
    if (message.trim().length < 3) {
      setError('Beschreib in ein paar Worten, was sich an deinem Tag geändert hat.');
      textarea.current?.focus();
      return;
    }
    void runReplan(message);
  }
  function planFromCheckIn() {
    const text = checkInMessage(checkIn, plan);
    setMessage(text);
    void runReplan(text);
  }
  async function voiceReplan(change: string, signal: AbortSignal) {
    if (requestController.current || busy)
      return { status: 'error', summary: 'Es läuft bereits eine Planung. Bitte kurz warten.' };
    const controller = new AbortController();
    requestController.current = controller;
    setBusy(true);
    clearDraft();
    setMessage(change);
    try {
      return await executeVoiceReplan(change, {
        read: () => workspaceRef.current,
        signal,
        request: async (source, text) => {
          const result = await fetch('/api/replan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.any([signal, controller.signal]),
            body: JSON.stringify({ plan: source.plan, checkIn: source.checkIn, message: text }),
          });
          const body = await result.json();
          if (!result.ok) throw new Error(body.error || 'Der Plan konnte nicht erstellt werden.');
          return body;
        },
        commit: (next) => {
          workspaceRef.current = next;
          setWorkspace(next);
          setResponse(null);
          setMessage('');
          const recorded = recordAcceptedPlan(progress);
          setProgress(recorded.progress);
          celebrate(recorded.unlocked);
        },
        showResult: setResponse,
        showApplied: (applied, changes) => {
          setVoiceResult(applied);
          toastManager.add({
            type: 'success',
            title: 'Plan im Gespräch angepasst',
            description: changes.length
              ? changes
                  .slice(0, 3)
                  .map((change) => `${change.title}: ${change.before} → ${change.after}`)
                  .join(' · ') +
                (changes.length > 3
                  ? ` · ${changes.length - 3} weitere Änderungen im Gespräch.`
                  : '')
              : applied.result.summary,
            actionProps: { children: 'Rückgängig', onClick: voiceUndo },
          });
        },
      });
    } catch (problem) {
      const summary = signal.aborted
        ? 'Die Planung wurde abgebrochen.'
        : problem instanceof Error
          ? problem.message
          : 'Die Planung ist fehlgeschlagen.';
      if (!signal.aborted) setError(summary);
      return { status: 'error', summary };
    } finally {
      requestController.current = null;
      setBusy(false);
    }
  }
  function voiceUndo() {
    if (requestController.current || busy)
      return { status: 'error', summary: 'Es läuft gerade eine Planung.' };
    const source = workspaceRef.current;
    const previous = source.history.at(-1);
    if (!previous)
      return { status: 'error', summary: 'Es gibt keine Änderung zum Rückgängigmachen.' };
    const next = { ...source, ...previous, history: source.history.slice(0, -1) };
    workspaceRef.current = next;
    setWorkspace(next);
    clearDraft();
    toastManager.add({
      title: 'Rückgängig gemacht',
      description: 'Die letzte Änderung ist zurückgenommen.',
    });
    return {
      status: 'applied',
      summary: 'Die letzte Änderung wurde rückgängig gemacht.',
      plan: describeDay(next),
    };
  }
  function acceptPlan() {
    if (!proposal || !response) return;
    setWorkspace((previous) => ({
      ...previous,
      plan: proposal,
      checkIn: {
        ...previous.checkIn,
        energy: response.result.energy,
        energyLevel: response.result.energyLevel,
        sleepHours: response.result.sleepHours,
      },
      history: [...previous.history, { plan: previous.plan, checkIn: previous.checkIn }].slice(-5),
    }));
    setResponse(null);
    setMessage('');
    const recorded = recordAcceptedPlan(progress);
    setProgress(recorded.progress);
    toastManager.add({
      type: 'success',
      title: 'Plan übernommen',
      description: 'Dein Tag ist neu sortiert.',
      actionProps: { children: 'Rückgängig', onClick: undo },
    });
    celebrate(recorded.unlocked);
  }
  function discard() {
    if (proposal)
      toastManager.add({
        title: 'Vorschlag verworfen',
        description: 'Dein bisheriger Plan gilt weiter.',
      });
    setResponse(null);
  }
  function undo() {
    setWorkspace((current) => {
      const previous = current.history.at(-1);
      if (!previous) return current;
      return { ...current, ...previous, history: current.history.slice(0, -1) };
    });
    clearDraft();
    toastManager.add({
      title: 'Rückgängig gemacht',
      description: 'Die letzte Änderung ist zurückgenommen.',
    });
  }
  function reset() {
    requestController.current?.abort();
    setWorkspace(freshWorkspace());
    setMessage('');
    clearDraft();
    toastManager.add({ title: 'Beispieltag wiederhergestellt' });
  }

  const dayTimeline = (
    <Timeline
      plan={plan}
      focusTaskId={checkIn.focusTaskId}
      label={proposal ? 'Bisheriger Plan' : 'Dein Tagesplan'}
    />
  );

  return (
    <div className="min-h-dvh">
      <a
        href="#day-plan"
        className="sr-only z-50 rounded-lg bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Zum Tagesplan
      </a>
      <AppHeader busy={busy} onReset={reset} onStartCheckIn={() => setFlowOpen(true)} />
      <div className="mx-auto grid max-w-7xl gap-6 px-4 pb-6 sm:px-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:[grid-template-areas:'side_copilot''side_day'] xl:grid-rows-1 xl:grid-cols-[17rem_minmax(0,1fr)_23rem] xl:[grid-template-areas:'side_day_copilot']">
        <div className="lg:[grid-area:side]">
          <CheckInSidebar
            checkIn={checkIn}
            plan={plan}
            progress={progress}
            disabled={busy}
            onChange={changeCheckIn}
            onStartFlow={() => setFlowOpen(true)}
          />
        </div>
        <div className="grid content-start gap-4 lg:[grid-area:copilot] xl:sticky xl:top-20 xl:self-start">
          {voiceResult && (
            <section
              className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs/5"
              aria-label="Ergebnis des Sprachauftrags"
            >
              <h3 className="font-semibold">Dein Tag ist angepasst</h3>
              <p className="text-sm text-muted-foreground">{voiceResult.result.summary}</p>
              <EnergyMeasures measures={voiceResult.measures} />
            </section>
          )}
          <CopilotPanel
            voiceControl={
              <VoicePanel
                busy={busy}
                getDay={() => describeDay(workspaceRef.current)}
                replan={voiceReplan}
                undo={voiceUndo}
              />
            }
            message={message}
            onMessageChange={(text) => {
              setMessage(text);
              clearDraft();
            }}
            onSubmit={replan}
            onCancel={() => requestController.current?.abort()}
            busy={busy}
            error={error}
            health={health}
            response={response}
            changedItems={changedItems}
            onAccept={acceptPlan}
            onDiscard={discard}
            textareaRef={textarea}
          />
        </div>
        <main
          id="day-plan"
          tabIndex={-1}
          className="grid scroll-mt-20 content-start gap-5 rounded-2xl border bg-card p-4 shadow-xs/5 outline-none sm:p-6 lg:[grid-area:day]"
        >
          {!storageAvailable && (
            <Alert variant="warning">
              <AlertDescription>
                Der Browser kann gerade nicht speichern. Änderungen bleiben nur in diesem Tab.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{dateLabel}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Demo-Uhrzeit {formatTime(plan.now)}, {fixedCount}{' '}
                {fixedCount === 1 ? 'fester Termin' : 'feste Termine'} vor dir
              </p>
            </div>
            <div className="flex items-center gap-2">
              {workspace.history.length > 0 && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Letzte Änderung rückgängig machen"
                        onClick={undo}
                        disabled={busy}
                      />
                    }
                  >
                    <Icon icon={Undo02Icon} size={18} />
                  </TooltipTrigger>
                  <TooltipPopup>Rückgängig</TooltipPopup>
                </Tooltip>
              )}
              <ScreenshotImport onAdd={addTasks} disabled={busy} />
              <AddTask onAdd={(item) => addTasks([item])} disabled={busy} />
            </div>
          </div>
          {proposal && response ? (
            <Tabs key={response.meta.elapsedMs} defaultValue="proposal" className="gap-4">
              <TabsList>
                <TabsTab value="proposal">
                  Vorschlag
                  {changedItems.length > 0 && (
                    <span className="rounded-md bg-primary px-1.5 text-xs text-primary-foreground tabular">
                      {changedItems.length}
                    </span>
                  )}
                </TabsTab>
                <TabsTab value="current">Bisher</TabsTab>
              </TabsList>
              <TabsPanel value="proposal">
                <Timeline
                  plan={proposal}
                  original={plan}
                  result={response.result}
                  focusTaskId={checkIn.focusTaskId}
                  label="Vorschlag"
                />
              </TabsPanel>
              <TabsPanel value="current">{dayTimeline}</TabsPanel>
            </Tabs>
          ) : (
            dayTimeline
          )}
        </main>
      </div>
      <CheckInFlow
        open={flowOpen}
        onOpenChange={setFlowOpen}
        checkIn={checkIn}
        plan={plan}
        onComplete={completeCheckIn}
        onPlanDay={planFromCheckIn}
        planningDisabled={busy}
      />
    </div>
  );
}
