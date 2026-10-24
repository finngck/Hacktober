import { HugeiconsIcon, type HugeiconsIconProps } from '@hugeicons/react';

export function Icon({ icon, size = 20, ...props }: HugeiconsIconProps) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.7} aria-hidden="true" {...props} />;
}
