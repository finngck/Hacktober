import { Moon02Icon, Target02Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import {
  energyFromLevel,
  energyLevelLabels,
  energyLevelOf,
  moodLabels,
  sleepQualityLabels,
  stressLabels,
  formatTime,
  type CheckIn,
  type Plan,
  type SleepQuality,
} from '../../../shared/contracts';
import { cn } from '@/lib/utils';
import { Icon } from '../Icon';
import { ChoiceChip, ChoiceGroup, ChoiceItem } from './Choice';
import { DaylightSlider } from './DaylightSlider';
import {
  exclusionOptions,
  focusCandidates,
  formatHours,
  moodIcons,
  productiveTimeLabels,
  sleepVerdict,
} from './checkInOptions';

type ControlProps = { checkIn: CheckIn; onChange: (patch: Partial<CheckIn>) => void };

export function SleepControl({ checkIn, onChange }: ControlProps) {
  return (
    <div className="grid gap-4">
      <DaylightSlider
        label="Sleep last night"
        tone="sleep"
        min={3}
        max={11}
        step={0.5}
        value={Math.min(11, Math.max(3, checkIn.sleepHours))}
        onValueChange={(sleepHours) => onChange({ sleepHours })}
        display={formatHours(checkIn.sleepHours)}
        hint={sleepVerdict(checkIn.sleepHours)}
        startLabel="3 h"
        endLabel="11 h"
      />
      <div className="grid gap-2">
        <span className="text-sm text-muted-foreground">How restful was your night?</span>
        <ChoiceGroup
          value={[checkIn.sleepQuality]}
          onValueChange={(value) => {
            if (value[0]) onChange({ sleepQuality: value[0] as SleepQuality });
          }}
        >
          {(Object.keys(sleepQualityLabels) as SleepQuality[]).map((quality) => (
            <ChoiceItem key={quality} value={quality}>
              {quality === 'good' && <Icon icon={Moon02Icon} size={16} />}
              {sleepQualityLabels[quality]}
            </ChoiceItem>
          ))}
        </ChoiceGroup>
      </div>
    </div>
  );
}

export function EnergyControl({ checkIn, onChange }: ControlProps) {
  const level = energyLevelOf(checkIn);
  return (
    <div className="grid gap-3">
      <DaylightSlider
        label="Energy right now"
        tone="sun"
        min={1}
        max={5}
        value={level}
        onValueChange={(energyLevel) =>
          onChange({ energyLevel, energy: energyFromLevel(energyLevel) })
        }
        display={energyLevelLabels[level - 1]}
        startLabel="Very low"
        endLabel="Very high"
      />
    </div>
  );
}

export function MoodControl({ checkIn, onChange }: ControlProps) {
  return (
    <DaylightSlider
      label="Mood"
      tone="mood"
      min={1}
      max={5}
      value={checkIn.mood}
      onValueChange={(mood) => onChange({ mood })}
      display={
        <span className="inline-flex items-center gap-2">
          <Icon icon={moodIcons[checkIn.mood - 1]} size={26} className="text-muted-foreground" />
          {moodLabels[checkIn.mood - 1]}
        </span>
      }
      startLabel="Awful"
      endLabel="Really good"
    />
  );
}

export function StressControl({ checkIn, onChange }: ControlProps) {
  return (
    <DaylightSlider
      label="How stressed are you?"
      tone="stress"
      min={1}
      max={5}
      value={checkIn.stress}
      onValueChange={(stress) => onChange({ stress })}
      display={stressLabels[checkIn.stress - 1]}
      startLabel="Relaxed"
      endLabel="Overloaded"
    />
  );
}

export function FocusControl({ checkIn, onChange, plan }: ControlProps & { plan: Plan }) {
  const candidates = focusCandidates(plan);
  const option = (id: string | null, title: string, detail: string) => {
    const selected = checkIn.focusTaskId === id;
    return (
      <button
        key={id ?? 'none'}
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={() => onChange({ focusTaskId: id })}
        className={cn(
          'flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-[background-color,border-color,scale] active:scale-[0.99]',
          selected
            ? 'border-primary bg-accent'
            : 'border-border bg-card hover:border-input hover:bg-muted',
        )}
      >
        <span
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full border transition-colors',
            selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
          )}
        >
          {selected && <Icon icon={Tick02Icon} size={14} className="animate-pop" />}
        </span>
        <span className="grid">
          <span className="font-medium">{title}</span>
          <span className="text-xs text-muted-foreground">{detail}</span>
        </span>
      </button>
    );
  };
  return (
    <div className="grid gap-2" role="radiogroup" aria-label="Focus for today">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon icon={Target02Icon} size={16} />
        What's the one thing today?
      </p>
      {candidates.map((item) =>
        option(
          item.id,
          item.title,
          [
            `${item.duration}\u00a0min`,
            item.start === null ? 'still open' : `from ${formatTime(item.start)}`,
            item.deadline !== null ? `Deadline ${formatTime(item.deadline)}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        ),
      )}
      {option(null, 'No focus', 'Pivot weighs everything by priority.')}
    </div>
  );
}

export function PreferencesControl({ checkIn, onChange }: ControlProps) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <span className="text-sm text-muted-foreground">Most productive</span>
        <ChoiceGroup
          value={[checkIn.productiveTime]}
          onValueChange={(value) => {
            if (value[0]) onChange({ productiveTime: value[0] as CheckIn['productiveTime'] });
          }}
        >
          {(Object.keys(productiveTimeLabels) as CheckIn['productiveTime'][]).map((time) => (
            <ChoiceItem key={time} value={time}>
              {productiveTimeLabels[time]}
            </ChoiceItem>
          ))}
        </ChoiceGroup>
      </div>
      <div className="grid gap-2">
        <span className="text-sm text-muted-foreground">What's off the table today?</span>
        <div className="flex flex-wrap gap-2">
          {exclusionOptions.map((exclusion) => (
            <ChoiceChip
              key={exclusion.id}
              pressed={checkIn.exclusions.includes(exclusion.id)}
              onPressedChange={(pressed) =>
                onChange({
                  exclusions: pressed
                    ? [...checkIn.exclusions, exclusion.id]
                    : checkIn.exclusions.filter((value) => value !== exclusion.id),
                })
              }
            >
              <Icon icon={exclusion.icon} size={16} />
              {exclusion.label}
            </ChoiceChip>
          ))}
        </div>
      </div>
    </div>
  );
}
