import { useState, type FormEvent } from 'react';
import { Add01Icon } from '@hugeicons/core-free-icons';
import {
  categoryLabels,
  itemSchema,
  parseTime,
  type Category,
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
import { Icon } from '../Icon';
import { ChoiceGroup, ChoiceItem } from './Choice';
import { DaylightSlider } from './DaylightSlider';
import { categoryIcons } from './Timeline';

export const priorities = { high: 'Hoch', medium: 'Mittel', low: 'Niedrig' } as const;
const initial = {
  title: '',
  duration: 45,
  category: 'work' as Category,
  priority: 'medium' as keyof typeof priorities,
  start: '',
  deadline: '',
  fixed: false,
};

export function AddTask({
  onAdd,
  disabled,
}: {
  onAdd: (item: ScheduleItem) => string | undefined;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const update = (patch: Partial<typeof initial>) =>
    setForm((previous) => ({ ...previous, ...patch }));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (form.fixed && !form.start) return setError('Ein fester Termin braucht eine Startzeit.');
    const parsed = itemSchema.safeParse({
      id: crypto.randomUUID(),
      title: form.title,
      duration: form.duration,
      start: form.start ? parseTime(form.start) : null,
      deadline: form.deadline ? parseTime(form.deadline) : null,
      category: form.category,
      priority: form.priority,
      effort: 'medium',
      fixed: form.fixed,
      tags: [],
    });
    if (!parsed.success) return setError('Gib der Aufgabe einen Titel.');
    const problem = onAdd(parsed.data);
    if (problem) return setError(problem);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setForm(initial);
          setError('');
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" disabled={disabled} />}>
        <Icon icon={Add01Icon} size={18} />
        Aufgabe
      </DialogTrigger>
      <DialogPopup className="sm:max-w-md">
        <form onSubmit={submit} className="contents" noValidate>
          <DialogHeader>
            <DialogTitle>Was steht noch an?</DialogTitle>
            <DialogDescription>
              Ohne Startzeit bleibt die Aufgabe offen, bis Pivot sie einplant.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="task-title">Aufgabe</Label>
              <Input
                id="task-title"
                autoFocus
                maxLength={100}
                value={form.title}
                onChange={(event) => update({ title: event.target.value })}
                placeholder="Präsentation vorbereiten …"
              />
            </div>
            <DaylightSlider
              label="Dauer"
              tone="sun"
              min={5}
              max={240}
              step={5}
              value={form.duration}
              onValueChange={(duration) => update({ duration })}
              display={`${form.duration}\u00a0Min.`}
              startLabel="5 Min."
              endLabel="4 Std."
            />
            <div className="grid gap-2">
              <span className="text-sm font-medium">Kategorie</span>
              <ChoiceGroup
                variant="default"
                className="flex-wrap gap-1.5"
                value={[form.category]}
                onValueChange={(value) => value[0] && update({ category: value[0] as Category })}
              >
                {(Object.keys(categoryLabels) as Category[]).map((category) => (
                  <ChoiceItem
                    key={category}
                    value={category}
                    className="flex-none rounded-full border-input"
                  >
                    <Icon icon={categoryIcons[category]} size={16} />
                    {categoryLabels[category]}
                  </ChoiceItem>
                ))}
              </ChoiceGroup>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="task-start">Start (optional)</Label>
                <Input
                  id="task-start"
                  type="time"
                  value={form.start}
                  onChange={(event) => update({ start: event.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="task-deadline">Frist heute (optional)</Label>
                <Input
                  id="task-deadline"
                  type="time"
                  value={form.deadline}
                  onChange={(event) => update({ deadline: event.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Priorität</span>
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
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={form.fixed}
                onCheckedChange={(checked) => update({ fixed: checked === true })}
              />
              Fester Termin, darf nicht verschoben werden
            </Label>
            {error && (
              <Alert variant="error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button type="submit">Aufgabe hinzufügen</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
