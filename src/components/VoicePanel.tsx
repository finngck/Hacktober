import { useEffect, useRef, useState } from 'react';
import type { Conversation, Status } from '@elevenlabs/react';
import { Mic01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';
import { voiceToolArguments } from '../../shared/voice';

type Props = {
  busy: boolean;
  getDay: () => unknown;
  replan: (message: string, signal: AbortSignal) => Promise<unknown>;
  undo: () => unknown;
};
type Transcript = { key: string; role: 'user' | 'agent'; text: string };

export function VoicePanel(props: Props) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>('disconnected');
  const [speaking, setSpeaking] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<Transcript[]>([]);
  const [reply, setReply] = useState('');
  const conversation = useRef<Conversation | null>(null);
  const session = useRef<AbortController | null>(null);
  const latest = useRef(props);
  const connecting = useRef(false);

  useEffect(() => {
    latest.current = props;
  }, [props]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/voice/status', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((body) => setConfigured(body.configured === true))
      .catch(() => {
        if (!controller.signal.aborted) setConfigured(false);
      });
    return () => {
      controller.abort();
      session.current?.abort();
      void conversation.current?.endSession();
    };
  }, []);

  async function stop() {
    session.current?.abort();
    connecting.current = false;
    const current = conversation.current;
    conversation.current = null;
    setStatus('disconnected');
    setPlanning(false);
    await current?.endSession();
  }

  async function start() {
    if (connecting.current || conversation.current || latest.current.busy) return;
    connecting.current = true;
    const controller = new AbortController();
    session.current = controller;
    setError('');
    setMessages([]);
    setStatus('connecting');
    const active = () => !controller.signal.aborted;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('MIC_UNAVAILABLE');
      const [sdk, response] = await Promise.all([
        import('@elevenlabs/react'),
        fetch('/api/voice/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          signal: controller.signal,
        }),
      ]);
      const body = await response.json();
      if (!response.ok || typeof body.signedUrl !== 'string')
        throw new Error('SESSION_UNAVAILABLE');
      if (!active()) return;
      const current = await sdk.Conversation.startSession({
        signedUrl: body.signedUrl,
        connectionType: 'websocket',
        clientTools: {
          get_day_plan: () => JSON.stringify(latest.current.getDay()),
          replan_day: async (args: unknown) => {
            if (!active()) return JSON.stringify({ status: 'error', summary: 'Gespräch beendet.' });
            const parsed = voiceToolArguments.replan_day.safeParse(args);
            if (!parsed.success)
              return JSON.stringify({ status: 'error', summary: 'Der Änderungswunsch fehlt.' });
            setPlanning(true);
            try {
              return JSON.stringify(
                await latest.current.replan(parsed.data.message, controller.signal),
              );
            } catch {
              return JSON.stringify({
                status: 'error',
                summary: 'Die Planung ist fehlgeschlagen. Es wurde nichts übernommen.',
              });
            } finally {
              if (active()) setPlanning(false);
            }
          },
          undo_last_change: () =>
            JSON.stringify(
              active() ? latest.current.undo() : { status: 'error', summary: 'Gespräch beendet.' },
            ),
        },
        onStatusChange: ({ status: next }) => {
          if (active()) setStatus(next);
        },
        onModeChange: ({ mode }) => {
          if (active()) setSpeaking(mode === 'speaking');
        },
        onMessage: ({ role, message, event_id }) => {
          if (!active()) return;
          const key = `${role}-${event_id}`;
          setMessages((previous) =>
            [...previous.filter((item) => item.key !== key), { key, role, text: message }].slice(
              -8,
            ),
          );
        },
        onError: () => {
          if (active())
            setError('Die Sprachverbindung wurde unterbrochen. Bitte starte das Gespräch erneut.');
        },
        onDisconnect: (details) => {
          if (!active()) return;
          if (details.reason === 'error')
            setError('Die Sprachverbindung wurde unterbrochen. Bitte starte das Gespräch erneut.');
          controller.abort();
          conversation.current = null;
          connecting.current = false;
          setStatus('disconnected');
          setPlanning(false);
        },
      });
      if (!active()) {
        await current.endSession();
        return;
      }
      conversation.current = current;
    } catch (cause) {
      if (!active()) return;
      controller.abort();
      setStatus('disconnected');
      setError(
        cause instanceof Error &&
          /permission|denied|notallowed|mic_unavailable/i.test(cause.message)
          ? 'Bitte erlaube den Mikrofonzugriff im Browser, um mit Pivot zu sprechen.'
          : 'Die Sprachverbindung konnte nicht gestartet werden. Bitte versuche es erneut.',
      );
    } finally {
      connecting.current = false;
    }
  }

  const connected = status === 'connected';
  const inProgress = status !== 'disconnected';
  const label = planning
    ? 'Dein Tag wird angepasst …'
    : connected
      ? speaking
        ? 'Pivot spricht'
        : 'Ich höre dir zu'
      : status === 'connecting'
        ? 'Verbinde …'
        : 'Sag, was sich geändert hat.';

  return (
    <section
      className={cn(
        'grid gap-3 rounded-xl border bg-card p-4 shadow-xs/5',
        connected && 'border-success/40',
      )}
      aria-labelledby="voice-title"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground',
            inProgress && 'bg-success/10 text-success',
          )}
          aria-hidden="true"
        >
          <Icon icon={Mic01Icon} size={23} />
        </span>
        <div>
          <h2 id="voice-title" className="text-base font-semibold">
            Sprich mit Pivot
          </h2>
          <p role="status" className="text-sm text-muted-foreground">
            {label}
          </p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        „Ich bin erst ab 14 Uhr da. Plane meinen Tag um.“
      </p>
      <Button
        variant={inProgress ? 'secondary' : 'default'}
        onClick={() => {
          void (inProgress ? stop() : start());
        }}
        disabled={!inProgress && (configured !== true || props.busy)}
      >
        {inProgress ? 'Gespräch beenden' : 'Gespräch starten'}
      </Button>
      {configured === false && (
        <p className="text-xs text-muted-foreground">
          Der Sprachdialog ist noch nicht eingerichtet. Du kannst Änderungen unten eingeben.
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive-foreground" role="alert">
          {error}
        </p>
      )}
      {connected && (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!reply.trim() || planning || props.busy) return;
            conversation.current?.sendUserMessage(reply.trim());
            setReply('');
          }}
        >
          <label className="sr-only" htmlFor="voice-reply">
            Nachricht im Gespräch
          </label>
          <Input
            id="voice-reply"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            maxLength={2000}
            placeholder="Oder hier antworten …"
            disabled={planning || props.busy}
          />
          <Button
            variant="secondary"
            type="submit"
            disabled={!reply.trim() || planning || props.busy}
          >
            Senden
          </Button>
        </form>
      )}
      {messages.length > 0 && (
        <div
          className="grid max-h-64 gap-2 overflow-y-auto text-sm"
          role="log"
          aria-label="Gespräch mit Pivot"
          aria-live="polite"
        >
          {messages.map((message) => (
            <p
              key={message.key}
              className={cn(
                'grid gap-0.5 rounded-lg bg-muted p-2.5',
                message.role === 'agent' && 'bg-accent',
              )}
            >
              <strong>{message.role === 'user' ? 'Du' : 'Pivot'}</strong>
              <span>{message.text}</span>
            </p>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Sprachaufträge passen deinen Plan direkt an. Du kannst Änderungen rückgängig machen. Audio
        wird an ElevenLabs gesendet; Gespräch und Tagesplan werden mit Google verarbeitet.
      </p>
    </section>
  );
}
