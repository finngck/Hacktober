import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ImageUploadIcon } from '@hugeicons/core-free-icons';
import {
  categoryLabels,
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
import { readScreenshot } from '@/lib/screenshot';
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
  const requestController = useRef<AbortController | null>(null);

  useEffect(() => () => requestController.current?.abort(), []);

  function cancel() {
    requestController.current?.abort();
    requestController.current = null;
    setBusy(false);
  }

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
    cancel();
    reset();
    const controller = new AbortController();
    requestController.current = controller;
    const timeout = window.setTimeout(
      () => controller.abort(new DOMException('Upload timed out', 'TimeoutError')),
      65_000,
    );
    setBusy(true);
    try {
      const extracted = await readScreenshot(file, controller.signal);
      if (requestController.current !== controller || controller.signal.aborted) return;
      setRows(extracted.tasks.map(toRow));
      setNote(
        extracted.note ||
          (extracted.tasks.length ? '' : 'No tasks or appointments were found in the image.'),
      );
      setDone(true);
    } catch (problem) {
      if (requestController.current !== controller) return;
      setError(
        controller.signal.aborted
          ? 'Reading took too long. Try again or choose a smaller section.'
          : problem instanceof Error
            ? problem.message
            : "Couldn't read the image. Use a clear PNG, JPEG, or WebP.",
      );
    } finally {
      window.clearTimeout(timeout);
      if (requestController.current === controller) {
        requestController.current = null;
        setBusy(false);
      }
    }
  }
  function patch(key: string, change: Partial<Row>) {
    setRows((previous) => previous.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }
  function submit() {
    if (busy || disabled) return;
    const selected = rows.filter((row) => row.include);
    if (!selected.length) return setError('Select at least one task.');
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
      if (!parsed.success)
        return setError(`Check the title, time, and duration for "${row.title}".`);
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
        cancel();
        reset();
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button variant="outline" disabled={disabled} />}>
        <Icon icon={ImageUploadIcon} size={18} />
        Screenshot
      </DialogTrigger>
      <DialogPopup className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import screenshot</DialogTitle>
          <DialogDescription>
            Upload a timetable, task list, or deadline. Gemma reads out tasks and times, and you
            review them before anything goes into your plan. The image is sent to Google for
            analysis and isn't stored.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-4">
          <label className="inline-flex h-9 w-fit cursor-pointer items-center gap-2 rounded-lg border border-input bg-popover px-3 text-sm font-medium shadow-xs/5 hover:bg-accent has-disabled:cursor-default has-disabled:opacity-64 has-focus-visible:ring-2 has-focus-visible:ring-ring">
            {busy ? <Spinner /> : <Icon icon={ImageUploadIcon} size={18} />}
            {busy ? 'Reading image …' : 'Choose image'}
            <input
              type="file"
              className="sr-only"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={pick}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            PNG, JPEG, or WebP up to 20 MB. Large images are resized automatically.
          </p>
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
                  Include
                </Label>
                {row.when && (
                  <span className="text-xs text-muted-foreground">In image: {row.when}</span>
                )}
              </div>
              <Input
                aria-label="Title"
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
                  <Label htmlFor={`${row.key}-deadline`}>Deadline</Label>
                  <Input
                    id={`${row.key}-deadline`}
                    type="time"
                    value={row.deadline}
                    onChange={(event) => patch(row.key, { deadline: event.target.value })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`${row.key}-duration`}>Duration (min)</Label>
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
                Fixed appointment, start time required
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
            <Button onClick={submit} disabled={busy || disabled}>
              Add selected
            </Button>
          </DialogFooter>
        )}
      </DialogPopup>
    </Dialog>
  );
}
