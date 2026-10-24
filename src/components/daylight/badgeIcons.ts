import {
  AlarmClockIcon,
  BrainIcon,
  Calendar03Icon,
  CalendarSyncIcon,
  FireIcon,
  SunriseIcon,
} from '@hugeicons/core-free-icons';
import type { HugeiconsIconProps } from '@hugeicons/react';
import type { BadgeId } from '@/lib/progress';

export const badgeIcons: Record<BadgeId, HugeiconsIconProps['icon']> = {
  'first-check-in': SunriseIcon,
  'early-bird': AlarmClockIcon,
  'streak-3': FireIcon,
  'streak-7': Calendar03Icon,
  'first-plan': CalendarSyncIcon,
  'plans-5': BrainIcon,
};
