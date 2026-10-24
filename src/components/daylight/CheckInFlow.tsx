import { useEffect, useRef, useState } from 'react';
import { FireIcon, SparklesIcon, Sun03Icon } from '@hugeicons/core-free-icons';
import type { CheckIn, Plan } from '../../../shared/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { badges, type BadgeId } from '@/lib/progress';
import { Icon } from '../Icon';
import { firstControl } from './checkInOptions';
import {
  EnergyControl,
  FocusControl,
  MoodControl,
  SleepControl,
  StressControl,
} from './CheckInControls';

const steps = [
  { title: 'Wie hast du geschlafen?', description: 'Schlaf bestimmt, wie viel heute drin ist.' },
  {
    title: 'Wie viel Energie hast du?',
    description: 'Schieb die Sonne so hoch, wie du dich fühlst.',
  },
  { title: 'Wie geht es dir?', description: 'Bei viel Druck plant Pivot mehr Luft ein.' },
  {
    title: 'Was ist heute das Eine?',
    description: 'Dein Fokus bekommt das beste freie Zeitfenster.',
  },
];

export type CheckInResult = { streak: number; unlocked: BadgeId[] };

/**
 * The morning ritual: four short steps, then one celebratory moment.
 * Values are only applied when the person finishes, so closing early changes nothing.
 */
export function CheckInFlow({
  open,
  onOpenChange,
  checkIn,
  plan,
  onComplete,
  onPlanDay,
  planningDisabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkIn: CheckIn;
  plan: Plan;
  onComplete: (checkIn: CheckIn) => CheckInResult;
  onPlanDay: () => void;
  planningDisabled: boolean;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(checkIn);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const popup = useRef<HTMLDivElement>(null);
  const change = (patch: Partial<CheckIn>) => setDraft((previous) => ({ ...previous, ...patch }));

  useEffect(() => {
    // Every opening starts fresh from the saved check-in.
    if (!open) return;
    setStep(0);
    setDraft(checkIn);
    setResult(null);
  }, [open]);
  const reset = (nextOpen: boolean) => onOpenChange(nextOpen);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogPopup
        ref={popup}
        initialFocus={() => firstControl(popup.current)}
        className="sm:max-w-lg"
        showCloseButton={!result}
      >
        {result ? (
          <>
            <DialogPanel className="grid justify-items-center gap-4 py-8 text-center">
              <span className="relative grid size-28 place-items-center">
                <span className="absolute inset-0 animate-sunburst rounded-full bg-muted" />
                <span className="grid size-20 animate-sunburst place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
                  <Icon icon={Sun03Icon} size={44} />
                </span>
              </span>
              <DialogTitle className="text-3xl">Check-in erledigt</DialogTitle>
              <p className="inline-flex animate-rise items-center gap-2 rounded-full bg-accent px-3 py-1 font-medium">
                <Icon icon={FireIcon} size={18} className="text-muted-foreground" />
                {result.streak === 1 ? 'Tag 1 deiner Serie' : `${result.streak} Tage in Folge`}
              </p>
              {result.unlocked.length > 0 && (
                <ul className="grid w-full animate-rise gap-2 [animation-delay:150ms]">
                  {result.unlocked.map((id) => (
                    <li
                      key={id}
                      className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left"
                    >
                      <Icon icon={SparklesIcon} size={20} className="text-muted-foreground" />
                      <span className="grid">
                        <span className="font-medium">Neu: {badges[id].title}</span>
                        <span className="text-sm text-muted-foreground">
                          {badges[id].description}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <DialogDescription>
                Soll Pivot deinen restlichen Tag an diesen Check-in anpassen?
              </DialogDescription>
            </DialogPanel>
            <DialogFooter>
              <Button variant="ghost" onClick={() => reset(false)}>
                Später
              </Button>
              <Button
                disabled={planningDisabled}
                onClick={() => {
                  reset(false);
                  onPlanDay();
                }}
              >
                Tag anpassen
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              if (step < steps.length - 1) return setStep(step + 1);
              setResult(onComplete(draft));
            }}
          >
            <DialogHeader>
              <p className="text-sm text-muted-foreground">
                {greeting}. Schritt {step + 1} von {steps.length}
              </p>
              <div className="flex gap-1.5" aria-hidden="true">
                {steps.map((_, index) => (
                  <span key={index} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full origin-left rounded-full bg-primary transition-transform duration-500 ease-(--ease-out-soft)"
                      style={{ transform: `scaleX(${index <= step ? 1 : 0})` }}
                    />
                  </span>
                ))}
              </div>
              <DialogTitle className="pt-2 text-2xl">{steps[step].title}</DialogTitle>
              <DialogDescription>{steps[step].description}</DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <div key={step} className="grid animate-rise gap-6 py-1">
                {step === 0 && <SleepControl checkIn={draft} onChange={change} />}
                {step === 1 && <EnergyControl checkIn={draft} onChange={change} />}
                {step === 2 && (
                  <>
                    <MoodControl checkIn={draft} onChange={change} />
                    <StressControl checkIn={draft} onChange={change} />
                  </>
                )}
                {step === 3 && <FocusControl checkIn={draft} onChange={change} plan={plan} />}
              </div>
            </DialogPanel>
            <DialogFooter>
              {step > 0 && (
                <Button variant="ghost" onClick={() => setStep(step - 1)}>
                  Zurück
                </Button>
              )}
              <Button type="submit">
                {step < steps.length - 1 ? 'Weiter' : 'Check-in abschließen'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogPopup>
    </Dialog>
  );
}
