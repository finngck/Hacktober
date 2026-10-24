import { Moon02Icon } from '@hugeicons/core-free-icons';
import type { CheckIn, Plan } from '../../../shared/contracts';
import { selectMeasures } from '../../../shared/measures';
import { Button } from '@/components/ui/button';
import { Icon } from '../Icon';

export function TipsCard({
  plan,
  checkIn,
  disabled,
  onPlanBreak,
  onDismiss,
}: {
  plan: Plan;
  checkIn: CheckIn;
  disabled: boolean;
  onPlanBreak: (message: string) => void;
  onDismiss: () => void;
}) {
  // Derive from the saved check-in, independently of the transient planning response.
  // The shared selector keeps activity exclusions and nap cutoffs in force.
  const measures = selectMeasures({ plan, checkIn, message: 'Daily check-in' }, checkIn);
  const tip = measures.actions.find((measure) => measure.id === 'NAP_KURZ');
  const request = tip
    ? 'Please schedule a 25-minute rest break for a short nap in my remaining day. Keep fixed appointments and deadlines. Show me the updated plan before applying it.'
    : 'Please schedule a 15-minute rest break in my remaining day. Keep fixed appointments and deadlines. Show me the updated plan before applying it.';

  return (
    <section
      className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs/5"
      aria-labelledby="daily-tip-title"
    >
      <div className="flex items-center gap-2">
        <Icon icon={Moon02Icon} size={18} />
        <h2 id="daily-tip-title" className="text-base font-semibold">
          For you right now
        </h2>
      </div>
      <div className="grid gap-1.5">
        <p className="text-xs text-muted-foreground">
          {checkIn.energy === 'low' ? 'You reported low energy today' : 'Based on your check-in'}
        </p>
        <h3 className="text-sm font-medium">{tip?.title ?? 'Make room for a short break'}</h3>
        <p className="text-sm text-muted-foreground">
          {tip?.text ?? 'Keep a little breathing room between your tasks with a short rest break.'}
        </p>
        {tip?.hint && <p className="text-xs text-muted-foreground">{tip.hint}</p>}
      </div>
      <p className="text-xs text-muted-foreground">Review the suggested time before applying it.</p>
      <div className="grid gap-1" lang="de">
        <Button onClick={() => onPlanBreak(request)} disabled={disabled}>
          Pause einplanen
        </Button>
        <Button variant="ghost" onClick={onDismiss} disabled={disabled}>
          Heute ausblenden
        </Button>
      </div>
    </section>
  );
}
