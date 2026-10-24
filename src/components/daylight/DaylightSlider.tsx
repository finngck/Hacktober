import type { ReactNode } from 'react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

export type SliderTone = 'sleep' | 'sun' | 'mood' | 'stress';

/** A large, tactile slider. The value readout pops on every step so changes feel physical. */
export function DaylightSlider({
  label,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  tone,
  display,
  hint,
  startLabel,
  endLabel,
  className,
}: {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  tone: SliderTone;
  display: ReactNode;
  hint?: ReactNode;
  startLabel?: string;
  endLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-1', className)}>
      <div className="flex items-end justify-between gap-4">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          key={value}
          className="animate-pop text-xl leading-none font-semibold tracking-tight tabular"
          aria-hidden="true"
        >
          {display}
        </span>
      </div>
      <Slider
        className="dl-slider"
        data-tone={tone}
        value={value}
        min={min}
        max={max}
        step={step}
        getAriaLabel={() => label}
        onValueChange={(next) => {
          const number = Array.isArray(next) ? next[0] : next;
          if (number === value) return;
          // A tiny tick on phones that support it; ignored elsewhere.
          navigator.vibrate?.(6);
          onValueChange(number);
        }}
      />
      {(startLabel || endLabel || hint) && (
        <div className="flex justify-between gap-3 text-xs text-muted-foreground">
          <span>{startLabel}</span>
          {hint && <span className="font-medium text-foreground">{hint}</span>}
          <span>{endLabel}</span>
        </div>
      )}
    </div>
  );
}
