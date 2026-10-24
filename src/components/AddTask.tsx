import { useRef, useState, type FormEvent } from 'react';
import { Add01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { categoryLabels, itemSchema, parseTime, type ScheduleItem } from '../../shared/contracts';
import { Icon } from './Icon';

export function AddTask({
  onAdd,
  disabled,
}: {
  onAdd: (item: ScheduleItem) => string | undefined;
  disabled: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = itemSchema.safeParse({
      id: crypto.randomUUID(),
      title: form.get('title'),
      duration: Number(form.get('duration')),
      start: form.get('start') ? parseTime(String(form.get('start'))) : null,
      deadline: form.get('deadline') ? parseTime(String(form.get('deadline'))) : null,
      category: form.get('category'),
      priority: form.get('priority'),
      effort: 'medium',
      fixed: form.get('fixed') === 'on',
      tags: [],
    });
    if (!parsed.success) return setError('Prüfe Titel, Uhrzeit und Dauer.');
    const problem = onAdd(parsed.data);
    if (problem) return setError(problem);
    event.currentTarget.reset();
    dialog.current?.close();
  }
  return (
    <>
      <button
        className="button secondary"
        disabled={disabled}
        onClick={() => {
          setError('');
          dialog.current?.showModal();
        }}
      >
        <Icon icon={Add01Icon} size={18} />
        Aufgabe hinzufügen
      </button>
      <dialog ref={dialog} className="task-dialog" aria-labelledby="add-task-title">
        <form onSubmit={submit}>
          <div className="dialog-heading">
            <h2 id="add-task-title">Was steht noch an?</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Schließen"
              onClick={() => dialog.current?.close()}
            >
              <Icon icon={Cancel01Icon} />
            </button>
          </div>
          <label>
            Aufgabe
            <input
              name="title"
              maxLength={100}
              required
              autoFocus
              placeholder="Zum Beispiel: Präsentation vorbereiten"
            />
          </label>
          <div className="form-grid">
            <label>
              Dauer in Minuten
              <input
                name="duration"
                type="number"
                defaultValue={45}
                min={5}
                max={480}
                step={5}
                required
              />
            </label>
            <label>
              Kategorie
              <select name="category" defaultValue="work">
                {Object.entries(categoryLabels).map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>
              Startzeit (optional)
              <input name="start" type="time" />
            </label>
            <label>
              Frist heute (optional)
              <input name="deadline" type="time" />
            </label>
          </div>
          <label>
            Priorität
            <select name="priority" defaultValue="medium">
              <option value="high">Hoch</option>
              <option value="medium">Mittel</option>
              <option value="low">Niedrig</option>
            </select>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" name="fixed" />
            Fester Termin · Startzeit erforderlich
          </label>
          <p className="muted">
            Ohne Startzeit bleibt die Aufgabe offen, bis du sie einplanen lässt.
          </p>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" type="submit">
            Aufgabe hinzufügen
          </button>
        </form>
      </dialog>
    </>
  );
}
