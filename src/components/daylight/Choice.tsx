import type { ComponentProps } from 'react';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

/** Selected choices read clearly at a glance: filled with the brand colour, with a small pop. */
const pressed =
  'data-pressed:border-primary data-pressed:bg-primary data-pressed:text-primary-foreground data-pressed:animate-pop';

export function ChoiceGroup({ className, ...props }: ComponentProps<typeof ToggleGroup>) {
  return <ToggleGroup variant="outline" className={cn('w-full', className)} {...props} />;
}

export function ChoiceItem({ className, ...props }: ComponentProps<typeof ToggleGroupItem>) {
  return <ToggleGroupItem className={cn('flex-1', pressed, className)} {...props} />;
}

export function ChoiceChip({ className, ...props }: ComponentProps<typeof Toggle>) {
  return <Toggle variant="outline" className={cn('rounded-full', pressed, className)} {...props} />;
}
