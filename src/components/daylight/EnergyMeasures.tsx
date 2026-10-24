import { BatteryLowIcon } from '@hugeicons/core-free-icons';
import type { EnergyMeasures as Measures, Measure } from '../../../shared/measures';
import { Badge } from '@/components/ui/badge';
import { Icon } from '../Icon';

const typeLabels: Record<Measure['type'], string> = {
  massnahme: 'Action',
  massgabe: 'Guideline',
  restriktion: 'Better not',
};

export function EnergyMeasures({ measures }: { measures: Measures }) {
  const all = [...measures.actions, ...measures.restrictions];
  if (!all.length) return null;
  return (
    <section className="grid gap-2" aria-labelledby="energy-measures-title">
      <h4 id="energy-measures-title" className="flex items-center gap-2 text-sm font-semibold">
        <Icon icon={BatteryLowIcon} size={16} />
        More energy after little sleep
      </h4>
      <ul className="grid gap-1.5">
        {all.map((measure) => (
          <li key={measure.id} className="grid gap-0.5 rounded-lg border bg-background px-3 py-2">
            <span className="flex items-center gap-2">
              <Badge size="sm" variant={measure.type === 'restriktion' ? 'warning' : 'secondary'}>
                {typeLabels[measure.type]}
              </Badge>
              <strong className="text-sm font-medium">{measure.title}</strong>
            </span>
            <span className="text-sm text-muted-foreground">{measure.text}</span>
            {measure.hint && <span className="text-xs text-muted-foreground">{measure.hint}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
