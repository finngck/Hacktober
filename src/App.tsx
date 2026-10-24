import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Sun03Icon,
  Calendar03Icon,
  ArrowReloadHorizontalIcon,
  ArrowRight01Icon,
  SparklesIcon,
  Moon02Icon,
  Tick02Icon,
  Alert02Icon,
  Undo02Icon,
  LockKeyIcon,
  Clock01Icon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons';
import {
  replanResponseSchema,
  formatTime,
  validatePlan,
  energyLabels,
  type CheckIn,
  type ReplanResponse,
  type ScheduleItem,
} from '../shared/contracts';
import { demoPrompts } from '../shared/demo';
import { freshWorkspace, loadWorkspace, saveWorkspace } from './state';
import { Icon } from './components/Icon';
import { Timeline } from './components/Timeline';
import { AddTask } from './components/AddTask';
import { ScreenshotImport } from './components/ScreenshotImport';
import { CheckInPanel } from './components/CheckInPanel';
import { VoicePanel } from './components/VoicePanel';
import { describeDay, executeVoiceReplan } from './voice-tools';
import { EnergyMeasures } from './components/EnergyMeasures';

export default function App() {
  const [workspace, setWorkspace] = useState(loadWorkspace);
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<ReplanResponse | null>(null);
  const [voiceResult, setVoiceResult] = useState<ReplanResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [health, setHealth] = useState<{ configured: boolean; model: string } | null>(null);
  const proposalHeading = useRef<HTMLHeadingElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const requestController = useRef<AbortController | null>(null);
  const workspaceRef = useRef(workspace);
  const { plan, checkIn } = workspace;
  const proposal = response?.proposedPlan;
  const changedItems =
    proposal?.items.filter(
      (item) => plan.items.find((before) => before.id === item.id)?.start !== item.start,
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
  useEffect(() => {
    if (response) proposalHeading.current?.focus();
  }, [response]);

  function clearDraft() {
    setResponse(null);
    setVoiceResult(null);
    setError('');
    setNotice('');
  }
  function changeCheckIn(patch: Partial<CheckIn>) {
    clearDraft();
    setWorkspace((previous) => ({ ...previous, checkIn: { ...previous.checkIn, ...patch } }));
  }
  function addTask(item: ScheduleItem) {
    return addTasks([item]);
  }
  function addTasks(items: ScheduleItem[]) {
    if (plan.items.length + items.length > 40)
      return 'Der Prototyp unterstützt bis zu 40 Aufgaben.';
    if (items.some((item) => item.start !== null && item.start < plan.now))
      return 'Neue Aufgaben müssen nach der Demo-Uhrzeit 13:00 beginnen.';
    const nextPlan = { ...plan, items: [...plan.items, ...items] };
    const issues = validatePlan(nextPlan);
    if (issues.length) return issues.join(' ');
    clearDraft();
    setWorkspace((previous) => ({
      ...previous,
      plan: nextPlan,
      history: [...previous.history, { plan: previous.plan, checkIn: previous.checkIn }].slice(-5),
    }));
    setNotice(
      items.length === 1 ? 'Aufgabe hinzugefügt.' : `${items.length} Aufgaben hinzugefügt.`,
    );
    return undefined;
  }
  async function replan(event: FormEvent) {
    event.preventDefault();
    if (busy || message.trim().length < 3) return;
    clearDraft();
    setBusy(true);
    const controller = new AbortController();
    requestController.current = controller;
    try {
      const result = await fetch('/api/replan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ plan, checkIn, message }),
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
          setNotice('Dein Tagesplan wurde im Gespräch angepasst.');
        },
        showResult: setResponse,
        showApplied: setVoiceResult,
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
    setNotice('Die letzte Änderung wurde rückgängig gemacht.');
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
        sleepHours: response.result.sleepHours,
      },
      history: [...previous.history, { plan: previous.plan, checkIn: previous.checkIn }].slice(-5),
    }));
    setResponse(null);
    setMessage('');
    setNotice('Dein neuer Plan ist übernommen.');
  }
  function undo() {
    const previous = workspace.history.at(-1);
    if (!previous) return;
    clearDraft();
    setWorkspace((current) => ({ ...current, ...previous, history: current.history.slice(0, -1) }));
    setNotice('Die letzte Änderung wurde rückgängig gemacht.');
  }
  function reset() {
    setWorkspace(freshWorkspace());
    setMessage('');
    clearDraft();
    setNotice('Der Beispieltag ist wiederhergestellt.');
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#day-plan">
        Zum Tagesplan
      </a>
      <header className="app-header">
        <a className="brand" href="#day-plan" aria-label="Daylight, zum Tagesplan">
          <span className="brand-symbol">
            <Icon icon={Sun03Icon} size={27} />
          </span>
          daylight<span className="brand-dot">.</span>
        </a>
        <div className="header-context">
          <span className="context-divider" />
          Dein Tagescopilot
        </div>
        <div className="header-actions">
          <span className="demo-label">
            <span />
            Beispieltag
          </span>
          <button
            className="button quiet reset-button"
            aria-label="Demo zurücksetzen"
            onClick={reset}
            disabled={busy}
          >
            <Icon icon={ArrowReloadHorizontalIcon} size={17} />
            <span>Demo zurücksetzen</span>
          </button>
          <span className="avatar" aria-label="Lokales Demo-Profil">
            D
          </span>
        </div>
      </header>
      <div className="app-body">
        <aside className="sidebar" aria-label="Navigation">
          <div className="sidebar-top">
            <span className="workspace-label">Dein Raum</span>
            <a className="nav-item active" href="#day-plan">
              <Icon icon={Calendar03Icon} />
              Mein Tag
              <span className="nav-indicator" />
            </a>
            <a className="nav-item" href="#check-in">
              <Icon icon={Sun03Icon} />
              Mein Check-in
            </a>
          </div>
          <div className="sidebar-bottom">
            <div className="small-sun">
              <Icon icon={Sun03Icon} size={33} />
            </div>
            <p>
              Ein voller Tag braucht
              <br />
              auch etwas Luft.
            </p>
            <span>Lokal auf deinem Gerät</span>
          </div>
        </aside>
        <main className="main-workspace">
          <div className="page-heading">
            <div>
              <p className="date-label">
                <Icon icon={Calendar03Icon} size={17} />
                {dateLabel}
              </p>
              <h1>Dein Tag bleibt beweglich.</h1>
              <p className="page-description">
                Pläne ändern sich. Finde heraus, was heute noch gut passt.
              </p>
            </div>
            <span className="weather-mark" aria-hidden="true">
              <Icon icon={Sun03Icon} size={66} />
            </span>
          </div>
          {!storageAvailable && (
            <p className="message-banner warning" role="status">
              Der Browser kann gerade nicht speichern. Änderungen bleiben nur in diesem Tab
              erhalten.
            </p>
          )}
          {notice && (
            <div className="message-banner success" role="status">
              <Icon icon={CheckmarkCircle02Icon} size={19} />
              <span>{notice}</span>
              {workspace.history.length > 0 && (
                <button onClick={undo} disabled={busy}>
                  <Icon icon={Undo02Icon} size={16} />
                  Rückgängig
                </button>
              )}
            </div>
          )}
          <div className="workspace-grid">
            <section className="plan-panel" id="day-plan" aria-labelledby="plan-title">
              <div className="panel-heading">
                <div>
                  <h2 id="plan-title">Heute im Überblick</h2>
                  <p>
                    <span className="current-dot" />
                    Demo-Uhrzeit {formatTime(plan.now)}
                    <span className="text-separator">·</span>
                    {fixedCount} feste Termine
                  </p>
                </div>
                <div className="panel-actions">
                  <ScreenshotImport onAdd={addTasks} disabled={busy} />
                  <AddTask onAdd={addTask} disabled={busy} />
                </div>
              </div>
              <div className="plan-legend">
                <span>
                  <span className="legend-line fixed" />
                  Feste Termine
                </span>
                <span>
                  <span className="legend-line flexible" />
                  Verschiebbare Aufgaben
                </span>
                {workspace.history.length > 0 && (
                  <button className="undo-link" onClick={undo} disabled={busy}>
                    <Icon icon={Undo02Icon} size={15} />
                    Rückgängig
                  </button>
                )}
              </div>
              {proposal && (
                <div className="comparison-intro">
                  <Icon icon={SparklesIcon} size={19} />
                  <div>
                    <strong>Ein Vorschlag für deinen restlichen Tag</strong>
                    <span>
                      {changedItems.length} {changedItems.length === 1 ? 'Änderung' : 'Änderungen'}{' '}
                      · Dein bisheriger Plan gilt bis zur Bestätigung.
                    </span>
                  </div>
                </div>
              )}
              <div className={`timelines ${proposal ? 'comparing' : ''}`}>
                <Timeline plan={plan} label={proposal ? 'Bisher' : 'Dein Tagesplan'} />
                {proposal && (
                  <Timeline
                    plan={proposal}
                    original={plan}
                    result={response.result}
                    label="Vorschlag"
                  />
                )}
              </div>
              {proposal && (
                <div className="review-actions">
                  <p>
                    <Icon icon={CheckmarkCircle02Icon} size={17} />
                    Termine, Fristen und Zeiten geprüft.
                  </p>
                  <div>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setResponse(null);
                        setNotice('Vorschlag verworfen. Dein bisheriger Plan gilt weiter.');
                      }}
                    >
                      Verwerfen
                    </button>
                    <button className="button primary" onClick={acceptPlan}>
                      <Icon icon={Tick02Icon} size={18} />
                      Plan übernehmen
                    </button>
                  </div>
                </div>
              )}
            </section>
            <aside className="copilot-column" aria-label="Check-in und Planänderung">
              <VoicePanel
                busy={busy}
                getDay={() => describeDay(workspaceRef.current)}
                replan={voiceReplan}
                undo={voiceUndo}
              />
              {voiceResult && (
                <section className="voice-panel" aria-label="Ergebnis des Sprachauftrags">
                  <h3>Dein Tag ist angepasst</h3>
                  <p className="voice-description">{voiceResult.result.summary}</p>
                  <EnergyMeasures measures={voiceResult.measures} />
                </section>
              )}
              <CheckInPanel checkIn={checkIn} disabled={busy} onChange={changeCheckIn} />
              <section className="copilot-panel" aria-labelledby="copilot-title">
                <div className="copilot-heading">
                  <span className="copilot-icon">
                    <Icon icon={SparklesIcon} size={23} />
                  </span>
                  <div>
                    <h2 id="copilot-title">Was hat sich geändert?</h2>
                    <span>Wir finden einen neuen Rhythmus.</span>
                  </div>
                </div>
                <form onSubmit={replan}>
                  <label htmlFor="change-message" className="sr-only">
                    Änderung für deinen Tagesplan
                  </label>
                  <textarea
                    ref={textarea}
                    id="change-message"
                    rows={4}
                    maxLength={2000}
                    disabled={busy}
                    value={message}
                    onChange={(event) => {
                      setMessage(event.target.value);
                      clearDraft();
                    }}
                    placeholder="Mein Zug ist verspätet und ich habe schlecht geschlafen …"
                  />
                  <div className="composer-footer">
                    <span>
                      <span className={`connection-dot ${health?.configured ? 'ready' : ''}`} />
                      {health
                        ? health.configured
                          ? 'Gemma 4'
                          : 'API-Key fehlt'
                        : 'Verbindung wird geprüft'}
                    </span>
                    <button
                      type="submit"
                      className="button primary"
                      disabled={busy || message.trim().length < 3}
                    >
                      {busy ? (
                        <>
                          <span className="spinner" />
                          Plane um …
                        </>
                      ) : (
                        <>
                          Tag neu planen
                          <Icon icon={ArrowRight01Icon} size={17} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
                {error && (
                  <div className="inline-error" role="alert">
                    <Icon icon={Alert02Icon} size={19} />
                    <p>{error}</p>
                  </div>
                )}
                <div aria-live="polite" className="request-status">
                  {busy && (
                    <p>
                      Deine Termine, Aufgaben und Energie werden gemeinsam betrachtet. Dein Plan
                      bleibt bis zur Bestätigung erhalten.
                    </p>
                  )}
                </div>
                {!response && !busy && (
                  <div className="prompt-examples">
                    <p>Zum Ausprobieren</p>
                    {demoPrompts.map((prompt) => (
                      <button
                        key={prompt.label}
                        onClick={() => {
                          setMessage(prompt.message);
                          setError('');
                          textarea.current?.focus();
                        }}
                      >
                        <Icon icon={ArrowRight01Icon} size={15} />
                        {prompt.label}
                      </button>
                    ))}
                  </div>
                )}
                {response && (
                  <div className={`proposal-summary ${response.result.status}`}>
                    <h3 ref={proposalHeading} tabIndex={-1}>
                      <Icon
                        icon={response.result.status === 'proposal' ? SparklesIcon : Alert02Icon}
                        size={19}
                      />
                      {response.result.status === 'proposal'
                        ? 'Das würde ich ändern'
                        : response.result.status === 'conflict'
                          ? 'Das passt noch nicht zusammen'
                          : 'Eine kurze Rückfrage'}
                    </h3>
                    <p>{response.result.summary}</p>
                    {response.result.question && (
                      <p className="clarifying-question">{response.result.question}</p>
                    )}
                    <EnergyMeasures measures={response.measures} />
                    {proposal && (
                      <>
                        <div className="understood">
                          <span>
                            <Icon icon={Clock01Icon} size={15} />
                            Ab {formatTime(response.result.availabilityFrom)}
                          </span>
                          <span>
                            <Icon icon={Moon02Icon} size={15} />
                            {response.result.sleepHours} Std.
                          </span>
                          <span>Energie: {energyLabels[response.result.energy]}</span>
                        </div>
                        <ul className="reason-list">
                          {changedItems.map((item) => (
                            <li key={item.id}>
                              <span className={`reason-dot category-${item.category}`} />
                              <div>
                                <strong>{item.title}</strong>
                                <span>
                                  {
                                    response.result.placements.find(
                                      (placement) => placement.id === item.id,
                                    )?.reason
                                  }
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                        <button className="button primary accept-button" onClick={acceptPlan}>
                          <Icon icon={Tick02Icon} size={18} />
                          Plan übernehmen
                        </button>
                        <button className="discard-link" onClick={() => setResponse(null)}>
                          <Icon icon={Cancel01Icon} size={15} />
                          Vorschlag verwerfen
                        </button>
                      </>
                    )}
                    <p className="model-footnote">
                      Mit {response.meta.model} erstellt ·{' '}
                      {(response.meta.elapsedMs / 1000).toFixed(1)} s
                    </p>
                  </div>
                )}
              </section>
              <p className="control-note">
                <Icon icon={LockKeyIcon} size={16} />
                <span>
                  Textvorschläge bestätigst du selbst. Klare Sprachaufträge werden direkt umgesetzt
                  und lassen sich rückgängig machen.
                </span>
              </p>
            </aside>
          </div>
          <footer className="workspace-footer">
            <span>Daylight · Lokaler Prototyp</span>
            <span>Synthetische Beispieldaten · Heute statt alles auf einmal</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
