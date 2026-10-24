import { useState } from 'react';
import {
  ArrowReloadHorizontalIcon,
  MoreHorizontalIcon,
  SunriseIcon,
} from '@hugeicons/core-free-icons';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/ui/menu';
import { Icon } from '../Icon';

/** The wordmark: Pivot app icon (same file as the favicon) and name. */
export function Logo() {
  return (
    <span
      translate="no"
      className="inline-flex items-center gap-2 text-xl leading-none font-semibold tracking-tight"
    >
      <img src="/favicon.svg" alt="" className="size-7.5 shrink-0" />
      Pivot.
    </span>
  );
}

export function AppHeader({
  busy,
  onReset,
  onStartCheckIn,
}: {
  busy: boolean;
  onReset: () => void;
  onStartCheckIn: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <a
          href="#day-plan"
          aria-label="Pivot, go to day plan"
          className="inline-flex shrink-0 items-center rounded-full"
        >
          <Logo />
        </a>
        <Badge variant="outline" className="ml-1 max-sm:hidden">
          Sample day
        </Badge>
        <div className="ml-auto flex items-center">
          <Menu>
            <MenuTrigger render={<Button variant="ghost" size="icon" aria-label="More actions" />}>
              <Icon icon={MoreHorizontalIcon} size={20} />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem onClick={onStartCheckIn} disabled={busy}>
                <Icon icon={SunriseIcon} size={16} />
                Start check-in
              </MenuItem>
              <MenuItem variant="destructive" onClick={() => setConfirmReset(true)} disabled={busy}>
                <Icon icon={ArrowReloadHorizontalIcon} size={16} />
                Reset sample day
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      </div>
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset sample day?</AlertDialogTitle>
            <AlertDialogDescription>
              Your plan, check-in, and undo history return to their starting state. Your streak and
              badges stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmReset(false);
                onReset();
              }}
            >
              Reset
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </header>
  );
}
