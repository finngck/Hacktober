import { useEffect, useRef, useState } from 'react';
import type { Conversation, Status } from '@elevenlabs/react';
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
          ? 'Bitte erlaube den Mikrofonzugriff im Browser, um mit Daylight zu sprechen.'
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
        ? 'Daylight spricht'
        : 'Ich höre dir zu'
      : status === 'connecting'
        ? 'Verbinde …'
        : 'Sag, was sich geändert hat.';

  return (
    <section
      className={`voice-panel ${connected ? 'is-connected' : ''}`}
      aria-labelledby="voice-title"
    >
      <div className="voice-heading">
        <span className={`voice-indicator ${inProgress ? 'active' : ''}`} aria-hidden="true">
          <svg
            width="23"
            height="23"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
          </svg>
        </span>
        <div>
          <h2 id="voice-title">Sprich mit Daylight</h2>
          <p role="status">{label}</p>
        </div>
      </div>
      <p className="voice-description">„Ich bin erst ab 14 Uhr da. Plane meinen Tag um.“</p>
      <button
        className={`button ${inProgress ? 'secondary' : 'primary'} voice-button`}
        onClick={() => {
          void (inProgress ? stop() : start());
        }}
        disabled={!inProgress && (configured !== true || props.busy)}
      >
        {inProgress ? 'Gespräch beenden' : 'Gespräch starten'}
      </button>
      {configured === false && (
        <p className="voice-hint">
          Der Sprachdialog ist noch nicht eingerichtet. Du kannst Änderungen unten eingeben.
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {connected && (
        <form
          className="voice-reply"
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
          <input
            id="voice-reply"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            maxLength={2000}
            placeholder="Oder hier antworten …"
            disabled={planning || props.busy}
          />
          <button
            className="button secondary"
            type="submit"
            disabled={!reply.trim() || planning || props.busy}
          >
            Senden
          </button>
        </form>
      )}
      {messages.length > 0 && (
        <div
          className="voice-transcript"
          role="log"
          aria-label="Gespräch mit Daylight"
          aria-live="polite"
        >
          {messages.map((message) => (
            <p key={message.key} className={message.role}>
              <strong>{message.role === 'user' ? 'Du' : 'Daylight'}</strong>
              <span>{message.text}</span>
            </p>
          ))}
        </div>
      )}
      <p className="voice-hint">
        Sprachaufträge passen deinen Plan direkt an. Du kannst Änderungen rückgängig machen. Audio
        wird an ElevenLabs gesendet; Gespräch und Tagesplan werden mit Google verarbeitet.
      </p>
    </section>
  );
}
