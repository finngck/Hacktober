import {
  Sun03Icon,
  Moon02Icon,
  Settings02Icon,
  BatteryLowIcon,
  BatteryMedium01Icon,
  BatteryFullIcon,
} from '@hugeicons/core-free-icons';
import { energyLabels, type CheckIn, type Energy } from '../../shared/contracts';
import { Icon } from './Icon';

const exclusions = [
  { id: 'coffee', label: 'Kein Kaffee' },
  { id: 'running', label: 'Kein Joggen' },
  { id: 'gym', label: 'Kein Gym' },
] as const;
const energyIcons = { low: BatteryLowIcon, medium: BatteryMedium01Icon, high: BatteryFullIcon };

export function CheckInPanel({
  checkIn,
  disabled,
  onChange,
}: {
  checkIn: CheckIn;
  disabled: boolean;
  onChange: (patch: Partial<CheckIn>) => void;
}) {
  return (
    <section className="check-in-panel" id="check-in" aria-labelledby="check-in-title">
      <div className="section-title">
        <span className="sun-icon">
          <Icon icon={Sun03Icon} size={21} />
        </span>
        <h2 id="check-in-title">Wie ist deine Energie?</h2>
      </div>
      <fieldset disabled={disabled}>
        <legend className="sr-only">Dein Check-in</legend>
        <div className="energy-options" role="group" aria-label="Energielevel">
          {(['low', 'medium', 'high'] as Energy[]).map((energy) => (
            <button
              key={energy}
              className={checkIn.energy === energy ? 'selected' : ''}
              aria-pressed={checkIn.energy === energy}
              onClick={() => onChange({ energy })}
            >
              <Icon icon={energyIcons[energy]} size={18} />
              {energyLabels[energy]}
            </button>
          ))}
        </div>
        <label className="sleep-input">
          <span>
            <Icon icon={Moon02Icon} size={17} />
            Letzte Nacht
          </span>
          <span>
            <input
              aria-label="Schlafdauer in Stunden"
              type="number"
              min={0}
              max={16}
              step={0.5}
              value={checkIn.sleepHours}
              onChange={(event) => {
                if (event.target.value !== '')
                  onChange({ sleepHours: Math.min(16, Math.max(0, Number(event.target.value))) });
              }}
            />
            Std. Schlaf
          </span>
        </label>
        <details className="preferences">
          <summary>
            <Icon icon={Settings02Icon} size={16} />
            Deine Präferenzen<span>{checkIn.exclusions.length} Ausschlüsse</span>
          </summary>
          <div>
            <label>
              Am produktivsten
              <select
                value={checkIn.productiveTime}
                onChange={(event) =>
                  onChange({ productiveTime: event.target.value as CheckIn['productiveTime'] })
                }
              >
                <option value="morning">Vormittags</option>
                <option value="afternoon">Nachmittags</option>
                <option value="any">Keine Präferenz</option>
              </select>
            </label>
            <p className="preference-label">Was passt nicht zu dir?</p>
            {exclusions.map((exclusion) => (
              <label key={exclusion.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={checkIn.exclusions.includes(exclusion.id)}
                  onChange={(event) =>
                    onChange({
                      exclusions: event.target.checked
                        ? [...checkIn.exclusions, exclusion.id]
                        : checkIn.exclusions.filter((value) => value !== exclusion.id),
                    })
                  }
                />
                {exclusion.label}
              </label>
            ))}
          </div>
        </details>
      </fieldset>
    </section>
  );
}
