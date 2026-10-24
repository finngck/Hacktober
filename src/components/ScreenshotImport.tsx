import { useRef, useState, type ChangeEvent } from 'react';
import { Cancel01Icon, ImageUploadIcon } from '@hugeicons/core-free-icons';
import {
  categoryLabels,
  extractResponseSchema,
  formatTime,
  itemSchema,
  parseTime,
  type Category,
  type ExtractedTask,
  type ScheduleItem,
} from '../../shared/contracts';
import { Icon } from './Icon';

type Row = {
  key: string;
  include: boolean;
  title: string;
  duration: number;
  category: Category;
  start: string;
  deadline: string;
  priority: ExtractedTask['priority'];
  fixed: boolean;
  when: string | null;
};

const toRow = (task: ExtractedTask): Row => ({
  key: crypto.randomUUID(),
  include: true,
  title: task.title,
  duration: task.duration,
  category: task.category,
  start: task.start === null ? '' : formatTime(task.start),
  deadline: task.deadline === null ? '' : formatTime(task.deadline),
  priority: task.priority,
  fixed: task.fixed,
  when: task.when,
});

/** Shrinks the screenshot in the browser so the upload stays small and fast. */
async function prepareImage(file: File): Promise<{ image: string; mimeType: 'image/jpeg' }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return { image: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/jpeg' };
}

export function ScreenshotImport({
  onAdd,
  disabled,
}: {
  onAdd: (items: ScheduleItem[]) => string | undefined;
  disabled: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function reset() {
    setRows([]);
    setNote('');
    setError('');
    setDone(false);
  }
  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    reset();
    setBusy(true);
    try {
      const payload = await prepareImage(file);
      const result = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error || 'Das Bild konnte nicht gelesen werden.');
      const extracted = extractResponseSchema.parse(body);
      setRows(extracted.tasks.map(toRow));
      setNote(
        extracted.note ||
          (extracted.tasks.length ? '' : 'Im Bild wurden keine Aufgaben oder Termine erkannt.'),
      );
      setDone(true);
    } catch (problem) {
      setError(
        problem instanceof Error && !(problem instanceof SyntaxError)
          ? problem.message
          : 'Das Bild konnte nicht gelesen werden. Nutze ein klares PNG, JPEG oder WebP.',
      );
    } finally {
      setBusy(false);
    }
  }
  function patch(key: string, change: Partial<Row>) {
    setRows((previous) => previous.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }
  function submit() {
    const selected = rows.filter((row) => row.include);
    if (!selected.length) return setError('Wähle mindestens eine Aufgabe aus.');
    const items: ScheduleItem[] = [];
    for (const row of selected) {
      const parsed = itemSchema.safeParse({
        id: crypto.randomUUID(),
        title: row.title,
        duration: Number(row.duration),
        start: row.start ? parseTime(row.start) : null,
        deadline: row.deadline ? parseTime(row.deadline) : null,
        category: row.category,
        priority: row.priority,
        effort: 'medium',
        fixed: row.fixed,
        tags: [],
      });
      if (!parsed.success) return setError(`Prüfe Titel, Uhrzeit und Dauer bei „${row.title}“.`);
      items.push(parsed.data);
    }
    const problem = onAdd(items);
    if (problem) return setError(problem);
    reset();
    dialog.current?.close();
  }

  return (
    <>
      <button
        className="button secondary"
        disabled={disabled}
        onClick={() => {
          reset();
          dialog.current?.showModal();
        }}
      >
        <Icon icon={ImageUploadIcon} size={18} />
        Screenshot importieren
      </button>
      <dialog ref={dialog} className="task-dialog import-dialog" aria-labelledby="import-title">
        <div className="dialog-heading">
          <h2 id="import-title">Screenshot importieren</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Schließen"
            onClick={() => dialog.current?.close()}
          >
            <Icon icon={Cancel01Icon} />
          </button>
        </div>
        <p className="muted">
          Lade einen Screenshot von Stundenplan, Aufgabenliste oder Frist hoch. Gemma liest Aufgaben
          und Zeiten aus; du prüfst und korrigierst sie, bevor etwas in den Plan kommt. Das Bild
          wird zur Analyse an Google gesendet und nicht gespeichert.
        </p>
        <label className="button secondary file-pick">
          {busy ? 'Bild wird gelesen …' : 'Bild auswählen'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={pick}
          />
        </label>
        {note && <p className="muted">{note}</p>}
        {rows.length > 0 && (
          <div className="import-rows">
            {rows.map((row) => (
              <fieldset key={row.key} className="import-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={row.include}
                    onChange={(event) => patch(row.key, { include: event.target.checked })}
                  />
                  Übernehmen
                  {row.when && <span className="muted"> · im Bild: {row.when}</span>}
                </label>
                <input
                  aria-label="Titel"
                  value={row.title}
                  maxLength={100}
                  onChange={(event) => patch(row.key, { title: event.target.value })}
                />
                <div className="form-grid">
                  <label>
                    Startzeit
                    <input
                      type="time"
                      value={row.start}
                      onChange={(event) => patch(row.key, { start: event.target.value })}
                    />
                  </label>
                  <label>
                    Frist
                    <input
                      type="time"
                      value={row.deadline}
                      onChange={(event) => patch(row.key, { deadline: event.target.value })}
                    />
                  </label>
                  <label>
                    Dauer (Min.)
                    <input
                      type="number"
                      min={5}
                      max={480}
                      step={5}
                      value={row.duration}
                      onChange={(event) => patch(row.key, { duration: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    Kategorie
                    <select
                      value={row.category}
                      onChange={(event) =>
                        patch(row.key, { category: event.target.value as Category })
                      }
                    >
                      {Object.entries(categoryLabels).map(([value, name]) => (
                        <option key={value} value={value}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={row.fixed}
                    onChange={(event) => patch(row.key, { fixed: event.target.checked })}
                  />
                  Fester Termin · Startzeit erforderlich
                </label>
              </fieldset>
            ))}
          </div>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {done && rows.length > 0 && (
          <button className="button primary" type="button" onClick={submit}>
            Ausgewählte hinzufügen
          </button>
        )}
      </dialog>
    </>
  );
}
