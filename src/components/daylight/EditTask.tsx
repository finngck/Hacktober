import { useEffect, useState, type FormEvent } from 'react';
import {
  formatTime,
  itemSchema,
  parseTime,
  type Plan,
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
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { priorities } from './AddTask';
import { ChoiceGroup, ChoiceItem } from './Choice';
import { DaylightSlider } from './DaylightSlider';

const formFor = (item: ScheduleItem) => ({
  title: item.title,
  duration: item.duration,
  priority: item.priority,
  start: item.start === null ? '' : formatTime(item.start),
  fixed: item.fixed,
});

/** Edits one task of the active plan. Started blocks keep their time; everything else is open. */
export function EditTask({
  item,
  plan,
  onSave,
  onClose,
}: {
  item: ScheduleItem | null;
  plan: Plan;
  onSave: (item: ScheduleItem) => string | undefined;
  onClose: () => void;
}) {
  const [form, setForm] = useState(() => (item ? formFor(item) : null));
  const [error, setError] = useState('');
  useEffect(() => {
    setForm(item ? formFor(item) : null);
    setError('');
  }, [item]);
  const started = item !== null && item.start !== null && item.start < plan.now;
  const update = (patch: Partial<ReturnType<typeof formFor>>) =>
    setForm((previous) => previous && { ...previous, ...patch });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!item || !form) return;
    if (form.fixed && !form.start) return setError('A fixed appointment needs a start time.');
    const parsed = itemSchema.safeParse({
      ...item,
      title: form.title,
      duration: started ? item.duration : form.duration,
      priority: form.priority,
      fixed: form.fixed,
      start: started ? item.start : form.start ? parseTime(form.start) : null,
    });
    if (!parsed.success) return setError('Give the task a title.');
    const problem = onSave(parsed.data);
    if (problem) return setError(problem);
    onClose();
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="sm:max-w-md">
        {form && (
          <form onSubmit={submit} className="contents" noValidate>
            <DialogHeader>
              <DialogTitle>Edit task</DialogTitle>
              <DialogDescription>
                {started
                  ? 'This block has already started. Time and duration stay; you can change the title and priority.'
                  : 'Without a start time, the task stays open today until Pivot schedules it.'}
              </DialogDescription>
            </DialogHeader>
            <DialogPanel className="grid gap-5">
              <div className="grid gap-2">
                <Label htmlFor="edit-title">Task</Label>
                <Input
                  id="edit-title"
                  maxLength={100}
                  value={form.title}
                  onChange={(event) => update({ title: event.target.value })}
                />
              </div>
              {!started && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-start">Start</Label>
                    <div className="flex gap-2">
                      <Input
                        id="edit-start"
                        type="time"
                        step={300}
                        value={form.start}
                        onChange={(event) => update({ start: event.target.value })}
                      />
                      {!form.fixed && form.start && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => update({ start: '' })}
                        >
                          Leave open today
                        </Button>
                      )}
                    </div>
                  </div>
                  <DaylightSlider
                    label="Duration"
                    tone="sun"
                    min={5}
                    max={240}
                    step={5}
                    value={form.duration}
                    onValueChange={(duration) => update({ duration })}
                    display={`${form.duration}\u00a0min`}
                    startLabel="5 min"
                    endLabel="4 h"
                  />
                </>
              )}
              <div className="grid gap-2">
                <span className="text-sm font-medium">Priority</span>
                <ChoiceGroup
                  value={[form.priority]}
                  onValueChange={(value) =>
                    value[0] && update({ priority: value[0] as keyof typeof priorities })
                  }
                >
                  {(Object.keys(priorities) as (keyof typeof priorities)[]).map((priority) => (
                    <ChoiceItem key={priority} value={priority}>
                      {priorities[priority]}
                    </ChoiceItem>
                  ))}
                </ChoiceGroup>
              </div>
              {!started && (
                <Label className="flex items-center gap-2 font-normal">
                  <Checkbox
                    checked={form.fixed}
                    onCheckedChange={(checked) => update({ fixed: checked === true })}
                  />
                  Fixed appointment, Pivot won't move it
                </Label>
              )}
              {error && (
                <Alert variant="error">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </DialogPanel>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Save changes</Button>
            </DialogFooter>
          </form>
        )}
      </DialogPopup>
    </Dialog>
  );
}
