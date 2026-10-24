import type { ComponentProps } from 'react';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

/** Selected choices use the coss accent surface and a heavier label. */
const pressed = 'data-pressed:bg-accent data-pressed:text-foreground data-pressed:font-medium';

export function ChoiceGroup({ className, ...props }: ComponentProps<typeof ToggleGroup>) {
  return <ToggleGroup variant="outline" className={cn('w-full', className)} {...props} />;
}

export function ChoiceItem({ className, ...props }: ComponentProps<typeof ToggleGroupItem>) {
  return <ToggleGroupItem className={cn('flex-1', pressed, className)} {...props} />;
}

export function ChoiceChip({ className, ...props }: ComponentProps<typeof Toggle>) {
  return <Toggle variant="outline" className={cn('rounded-full', pressed, className)} {...props} />;
}
