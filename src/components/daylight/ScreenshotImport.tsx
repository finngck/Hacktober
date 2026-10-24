import { useState, type ChangeEvent } from 'react';
import { ImageUploadIcon } from '@hugeicons/core-free-icons';
import {
  categoryLabels,
  extractResponseSchema,
  formatTime,
  itemSchema,
  parseTime,
  type Category,
  type ExtractedTask,
  type ScheduleItem,
} from '../../../shared/contracts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Icon } from '../Icon';
import { ChoiceGroup, ChoiceItem } from './Choice';
import { categoryIcons } from './Timeline';

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
  const [open, setOpen] = useState(false);
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
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" disabled={disabled} />}>
        <Icon icon={ImageUploadIcon} size={18} />
        Screenshot
      </DialogTrigger>
      <DialogPopup className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Screenshot importieren</DialogTitle>
          <DialogDescription>
            Stundenplan, Aufgabenliste oder Frist hochladen. Gemma liest Aufgaben und Zeiten aus, du
            prüfst sie, bevor etwas in den Plan kommt. Das Bild geht zur Analyse an Google und wird
            nicht gespeichert.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-4">
          <label className="inline-flex h-9 w-fit cursor-pointer items-center gap-2 rounded-lg border border-input bg-popover px-3 text-sm font-medium shadow-xs/5 hover:bg-accent has-disabled:cursor-default has-disabled:opacity-64 has-focus-visible:ring-2 has-focus-visible:ring-ring">
            {busy ? <Spinner /> : <Icon icon={ImageUploadIcon} size={18} />}
            {busy ? 'Bild wird gelesen …' : 'Bild auswählen'}
            <input
              type="file"
              className="sr-only"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={pick}
            />
          </label>
          {note && <p className="text-sm text-muted-foreground">{note}</p>}
          {rows.map((row) => (
            <fieldset
              key={row.key}
              className="grid gap-3 rounded-xl border bg-background p-3 data-[off=true]:opacity-60"
              data-off={!row.include}
            >
              <div className="flex items-center justify-between gap-3">
                <Label className="flex items-center gap-2 font-normal">
                  <Checkbox
                    checked={row.include}
                    onCheckedChange={(checked) => patch(row.key, { include: checked === true })}
                  />
                  Übernehmen
                </Label>
                {row.when && (
                  <span className="text-xs text-muted-foreground">Im Bild: {row.when}</span>
                )}
              </div>
              <Input
                aria-label="Titel"
                value={row.title}
                maxLength={100}
                onChange={(event) => patch(row.key, { title: event.target.value })}
              />
              <div className="grid grid-cols-3 gap-2">
                <div className="grid gap-1">
                  <Label htmlFor={`${row.key}-start`}>Start</Label>
                  <Input
                    id={`${row.key}-start`}
                    type="time"
                    value={row.start}
                    onChange={(event) => patch(row.key, { start: event.target.value })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`${row.key}-deadline`}>Frist</Label>
                  <Input
                    id={`${row.key}-deadline`}
                    type="time"
                    value={row.deadline}
                    onChange={(event) => patch(row.key, { deadline: event.target.value })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`${row.key}-duration`}>Dauer (Min.)</Label>
                  <Input
                    id={`${row.key}-duration`}
                    type="number"
                    min={5}
                    max={480}
                    step={5}
                    value={row.duration}
                    onChange={(event) => patch(row.key, { duration: Number(event.target.value) })}
                  />
                </div>
              </div>
              <ChoiceGroup
                variant="default"
                className="flex-wrap gap-1.5"
                value={[row.category]}
                onValueChange={(value) =>
                  value[0] && patch(row.key, { category: value[0] as Category })
                }
              >
                {(Object.keys(categoryLabels) as Category[]).map((category) => (
                  <ChoiceItem
                    key={category}
                    value={category}
                    size="sm"
                    className="flex-none rounded-full border-input"
                  >
                    <Icon icon={categoryIcons[category]} size={14} />
                    {categoryLabels[category]}
                  </ChoiceItem>
                ))}
              </ChoiceGroup>
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox
                  checked={row.fixed}
                  onCheckedChange={(checked) => patch(row.key, { fixed: checked === true })}
                />
                Fester Termin, Startzeit erforderlich
              </Label>
            </fieldset>
          ))}
          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </DialogPanel>
        {done && rows.length > 0 && (
          <DialogFooter>
            <Button onClick={submit}>Ausgewählte hinzufügen</Button>
          </DialogFooter>
        )}
      </DialogPopup>
    </Dialog>
  );
}
