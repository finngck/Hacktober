import { BatteryLowIcon } from '@hugeicons/core-free-icons';
import type { EnergyMeasures as Measures, Measure } from '../../shared/measures';
import { Icon } from './Icon';

const typeLabels: Record<Measure['type'], string> = {
  massnahme: 'Maßnahme',
  massgabe: 'Maßgabe',
  restriktion: 'Lieber nicht',
};

export function EnergyMeasures({ measures }: { measures: Measures }) {
  const all = [...measures.actions, ...measures.restrictions];
  if (!all.length) return null;
  return (
    <section className="energy-measures" aria-labelledby="energy-measures-title">
      <h4 id="energy-measures-title">
        <Icon icon={BatteryLowIcon} size={16} />
        Für mehr Energie nach wenig Schlaf
      </h4>
      <ul>
        {all.map((measure) => (
          <li key={measure.id} className={`measure-${measure.type}`}>
            <span className="measure-type">{typeLabels[measure.type]}</span>
            <strong>{measure.title}</strong>
            <span>{measure.text}</span>
            {measure.hint && <span className="measure-hint">{measure.hint}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
