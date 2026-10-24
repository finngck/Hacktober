import { useEffect, useRef, useState } from 'react';
import { Conversation, type Status } from '@elevenlabs/react';
import {
  ArrowUp02Icon,
  CallEnd01Icon,
  Mic01Icon,
  MicOff01Icon,
  PauseIcon,
  PlayIcon,
  Undo02Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';
import { voiceErrorMessage, waitForVoice } from '@/lib/voice-session';
import { voiceToolArguments } from '../../shared/voice';

type Props = {
  busy: boolean;
  getDay: () => unknown;
  replan: (message: string, signal: AbortSignal) => Promise<unknown>;
  undo: () => unknown;
};
type Transcript = { key: string; role: 'user' | 'agent'; text: string };
type Outcome = {
  status?: string;
  summary?: string;
  question?: string | null;
  changes?: { title: string; before: string; after: string }[];
};

export function VoicePanel(props: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('disconnected');
  const [speaking, setSpeaking] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<Transcript[]>([]);
  const [reply, setReply] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const conversation = useRef<Conversation | null>(null);
  const session = useRef<AbortController | null>(null);
  const latest = useRef(props);
  const orb = useRef<HTMLDivElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  latest.current = props;

  useEffect(
    () => () => {
      session.current?.abort();
      void conversation.current?.endSession().catch(() => {});
    },
    [],
  );
  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'instant' });
  }, [messages]);
  useEffect(() => {
    if (status !== 'connected' || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    let frame: number;
    let smoothed = 0;
    const animate = () => {
      const current = conversation.current;
      const level = paused
        ? 0
        : speaking
          ? current?.getOutputVolume()
          : muted
            ? 0
            : current?.getInputVolume();
      smoothed += (Math.min(1, (level ?? 0) * 3) - smoothed) * 0.22;
      orb.current?.style.setProperty('--voice-level', smoothed.toFixed(3));
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      orb.current?.style.setProperty('--voice-level', '0');
    };
  }, [status, speaking, muted, paused]);

  async function stop() {
    session.current?.abort();
    session.current = null;
    const current = conversation.current;
    conversation.current = null;
    setStatus('disconnected');
    setPlanning(false);
    setSpeaking(false);
    setMuted(false);
    setPaused(false);
    await current?.endSession().catch(() => {});
  }

  async function start() {
    if (session.current || latest.current.busy) return;
    setOpen(true);
    const controller = new AbortController();
    session.current = controller;
    const active = () => session.current === controller && !controller.signal.aborted;
    setError('');
    setMessages([]);
    setReply('');
    setOutcome(null);
    setMuted(false);
    setPaused(false);
    setSpeaking(false);
    setStatus('connecting');
    setStage('Mikrofon freigeben …');
    const timer = window.setTimeout(() => {
      if (!active()) return;
      setError(voiceErrorMessage(new DOMException('', 'TimeoutError')));
      void stop();
    }, 30000);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('MIC_UNAVAILABLE');
      // Request permission immediately from the click, before fetching a session.
      const stream = await waitForVoice(
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        }),
        controller.signal,
        (late) => late.getTracks().forEach((track) => track.stop()),
      );
      stream.getTracks().forEach((track) => track.stop());
      if (!active()) return;
      setStage('Verbinde mit Pivot …');
      const response = await fetch('/api/voice/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionType: 'webrtc' }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) {
        setError(
          typeof body.error === 'string'
            ? body.error
            : 'Die Sprachverbindung ist gerade nicht erreichbar.',
        );
        await stop();
        return;
      }
      if (typeof body.conversationToken !== 'string') throw new Error('Missing conversation token');
      if (!active()) return;
      const current = await waitForVoice(
        Conversation.startSession({
          conversationToken: body.conversationToken,
          connectionType: 'webrtc',
          clientTools: {
            get_day_plan: () =>
              JSON.stringify(
                active()
                  ? latest.current.getDay()
                  : { status: 'error', summary: 'Gespräch beendet.' },
              ),
            replan_day: async (args: unknown) => {
              if (!active())
                return JSON.stringify({ status: 'error', summary: 'Gespräch beendet.' });
              const parsed = voiceToolArguments.replan_day.safeParse(args);
              if (!parsed.success)
                return JSON.stringify({ status: 'error', summary: 'Der Änderungswunsch fehlt.' });
              setPlanning(true);
              setOutcome(null);
              try {
                const result = (await latest.current.replan(
                  parsed.data.message,
                  controller.signal,
                )) as Outcome;
                if (active()) setOutcome(result);
                return JSON.stringify(result);
              } catch {
                const result = {
                  status: 'error',
                  summary: 'Die Planung ist fehlgeschlagen. Es wurde nichts übernommen.',
                };
                if (active()) setOutcome(result);
                return JSON.stringify(result);
              } finally {
                if (active()) setPlanning(false);
              }
            },
            undo_last_change: () => {
              const result = active()
                ? (latest.current.undo() as Outcome)
                : { status: 'error', summary: 'Gespräch beendet.' };
              if (active()) setOutcome(result);
              return JSON.stringify(result);
            },
          },
          onStatusChange: ({ status: next }) => {
            if (active() && next !== 'connected') setStatus(next);
          },
          onModeChange: ({ mode }) => {
            if (active()) setSpeaking(mode === 'speaking');
          },
          onMessage: ({ role, message, event_id }) => {
            if (!active()) return;
            const key = `${role}-${event_id}`;
            setMessages((previous) =>
              [...previous.filter((item) => item.key !== key), { key, role, text: message }].slice(
                -30,
              ),
            );
          },
          onError: (message) => {
            if (!active()) return;
            setError(voiceErrorMessage(message));
            void stop();
          },
          onDisconnect: (details) => {
            if (!active()) return;
            if (details.reason === 'error') setError(voiceErrorMessage(details.message));
            controller.abort();
            session.current = null;
            conversation.current = null;
            setStatus('disconnected');
            setPlanning(false);
            setSpeaking(false);
            setPaused(false);
            setMuted(false);
          },
        }),
        controller.signal,
        (late) => {
          void late.endSession().catch(() => {});
        },
      );
      if (!active()) {
        await current.endSession();
        return;
      }
      conversation.current = current;
      current.setVolume({ volume: 1 });
      setStatus('connected');
    } catch (cause) {
      if (!active()) return;
      setError(voiceErrorMessage(cause));
      await stop();
    } finally {
      window.clearTimeout(timer);
    }
  }

  const connected = status === 'connected';
  const inProgress = status !== 'disconnected';
  const state = paused
    ? 'paused'
    : planning
      ? 'planning'
      : connected
        ? speaking
          ? 'speaking'
          : muted
            ? 'muted'
            : 'listening'
        : inProgress
          ? 'connecting'
          : 'idle';
  const label = paused
    ? 'Gespräch pausiert'
    : planning
      ? 'Ich passe deinen Tag an'
      : connected
        ? speaking
          ? 'Pivot spricht'
          : muted
            ? 'Mikrofon ist aus'
            : 'Ich höre dir zu'
        : inProgress
          ? stage
          : error
            ? 'Lass uns neu verbinden'
            : 'Sprich mit Pivot';
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="w-full justify-center gap-2"
        disabled={props.busy && !inProgress}
        onClick={() => {
          if (inProgress) setOpen(true);
          else void start();
        }}
      >
        <Icon icon={Mic01Icon} size={18} />
        {inProgress ? 'Zurück zum Gespräch' : 'Änderung besprechen'}
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success" />
          Live
        </span>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) void stop();
        }}
      >
        <DialogPopup
          className="voice-dialog max-w-xl overflow-y-auto"
          bottomStickOnMobile={false}
          closeProps={{ 'aria-label': 'Gespräch schließen und beenden' }}
        >
          <div className="px-6 pt-7 text-center">
            <DialogTitle>Dein Tag. Im Gespräch.</DialogTitle>
            <DialogDescription className="mt-2">
              Sag, was sich geändert hat. Dein Plan passt sich live an.
            </DialogDescription>
          </div>
          <div ref={orb} className="voice-orb-stage" data-state={state} aria-hidden="true">
            <div className="voice-orb-halo" />
            <div className="voice-orb">
              <div className="voice-orb-flow" />
              <div className="voice-orb-current" />
              <div className="voice-orb-light" />
            </div>
          </div>
          <div className="px-6 text-center">
            <p className="text-lg font-semibold" role="status">
              {label}
            </p>
            <p className="mt-2 min-h-10 text-sm leading-relaxed text-muted-foreground">
              {paused
                ? planning
                  ? 'Mikrofon und Ton sind aus. Deine Planung läuft weiter.'
                  : 'Mikrofon und Ton sind aus. Setze das Gespräch fort, wenn du bereit bist.'
                : planning
                  ? 'Die Änderungen erscheinen gleich in deinem Tagesplan.'
                  : connected
                    ? 'Du kannst ganz normal sprechen und mich jederzeit unterbrechen.'
                    : inProgress
                      ? 'Erlaube das Mikrofon, wenn dein Browser danach fragt.'
                      : 'Zum Beispiel: „Ich bin erst ab 14 Uhr da. Plane meinen Tag um.“'}
            </p>
          </div>
          {messages.length > 0 && (
            <div
              ref={transcript}
              className="voice-transcript mx-6 mt-4 grid max-h-40 gap-3 overflow-y-auto rounded-xl border bg-background/60 p-4 text-sm leading-relaxed"
              role="log"
              aria-label="Gespräch mit Pivot"
              tabIndex={0}
            >
              {messages.map((message) => (
                <p
                  key={message.key}
                  className={cn('grid gap-1', message.role === 'user' && 'text-muted-foreground')}
                >
                  <strong className="text-xs">{message.role === 'user' ? 'Du' : 'Pivot'}</strong>
                  <span className="whitespace-pre-wrap break-words">{message.text}</span>
                </p>
              ))}
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="mx-6 mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive-foreground"
            >
              {error}
            </p>
          )}
          {outcome && (
            <details
              key={JSON.stringify(outcome)}
              className="mx-6 mt-4 rounded-xl border bg-background p-3 text-sm"
            >
              <summary className="cursor-pointer font-medium">
                {outcome.status === 'applied' ? 'Planänderung ansehen' : 'Rückmeldung ansehen'}
              </summary>
              <div className="mt-2 flex items-start justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {outcome.question || outcome.summary}
                </p>
                {outcome.status === 'applied' && outcome.changes && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={props.busy}
                    onClick={() => {
                      const result = latest.current.undo() as Outcome;
                      setOutcome(result);
                      conversation.current?.sendContextualUpdate(
                        `Der Nutzer hat Rückgängig angeklickt. Ergebnis: ${JSON.stringify(result)}`,
                      );
                    }}
                  >
                    <Icon icon={Undo02Icon} size={16} />
                    Rückgängig
                  </Button>
                )}
              </div>
              {!!outcome.changes?.length && (
                <ul className="mt-3 grid gap-2 text-sm">
                  {outcome.changes.map((change, index) => (
                    <li
                      key={`${change.title}-${index}`}
                      className="flex flex-wrap justify-between gap-x-3 gap-y-0.5"
                    >
                      <span>{change.title}</span>
                      <span className="tabular text-success-foreground">
                        {change.before} → {change.after}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          )}
          <div className="flex flex-wrap justify-center gap-3 px-6 py-5">
            {connected && (
              <Button
                className="rounded-full"
                variant={paused ? 'default' : 'secondary'}
                aria-pressed={paused}
                onClick={() => {
                  const next = !paused;
                  conversation.current?.setMicMuted(next || muted);
                  conversation.current?.setVolume({ volume: next ? 0 : 1 });
                  setPaused(next);
                }}
              >
                <Icon icon={paused ? PlayIcon : PauseIcon} size={20} />
                {paused ? 'Fortsetzen' : 'Pause'}
              </Button>
            )}
            {connected && (
              <Button
                variant={muted ? 'secondary' : 'outline'}
                className="rounded-full"
                aria-label={muted ? 'Mikrofon einschalten' : 'Mikrofon stummschalten'}
                aria-pressed={muted}
                disabled={paused}
                onClick={() => {
                  conversation.current?.setMicMuted(!muted);
                  setMuted(!muted);
                }}
              >
                <Icon icon={muted ? MicOff01Icon : Mic01Icon} size={20} />
                {muted ? 'Mikrofon an' : 'Stummschalten'}
              </Button>
            )}
            {inProgress ? (
              <Button
                variant="destructive"
                className="rounded-full"
                onClick={() => {
                  void stop();
                }}
              >
                <Icon icon={CallEnd01Icon} size={20} />
                {connected ? 'Beenden' : 'Abbrechen'}
              </Button>
            ) : (
              <Button
                className="rounded-full"
                disabled={props.busy}
                onClick={() => {
                  void start();
                }}
              >
                <Icon icon={Mic01Icon} size={20} />
                {error ? 'Erneut verbinden' : 'Gespräch starten'}
              </Button>
            )}
          </div>
          {connected && (
            <form
              className="mx-6 mb-4 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!reply.trim() || planning || props.busy || paused) return;
                const text = reply.trim();
                conversation.current?.sendUserMessage(text);
                setMessages((previous) =>
                  [
                    ...previous,
                    { key: `typed-${crypto.randomUUID()}`, role: 'user' as const, text },
                  ].slice(-30),
                );
                setReply('');
              }}
            >
              <label className="sr-only" htmlFor="voice-reply">
                Nachricht im Gespräch
              </label>
              <Input
                id="voice-reply"
                value={reply}
                onChange={(event) => {
                  setReply(event.target.value);
                  conversation.current?.sendUserActivity();
                }}
                maxLength={2000}
                placeholder="Oder kurz tippen …"
                disabled={planning || props.busy || paused}
              />
              <Button
                size="icon"
                type="submit"
                aria-label="Nachricht senden"
                disabled={!reply.trim() || planning || props.busy || paused}
              >
                <Icon icon={ArrowUp02Icon} size={20} />
              </Button>
            </form>
          )}
          <p className="border-t px-6 py-4 text-center text-xs leading-relaxed text-muted-foreground">
            Änderungen werden direkt übernommen und lassen sich rückgängig machen. Audio:
            ElevenLabs. Gespräch und Planung: Google.
          </p>
        </DialogPopup>
      </Dialog>
    </>
  );
}
