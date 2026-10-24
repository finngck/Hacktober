import { useState } from 'react';
import {
  ArrowReloadHorizontalIcon,
  MoreHorizontalIcon,
  Sun03Icon,
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

/** The wordmark: sun icon on a dark tile, as in the favicon. */
export function Logo() {
  return (
    <span
      translate="no"
      className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight"
    >
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Icon icon={Sun03Icon} size={17} strokeWidth={2} />
      </span>
      daylight
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
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <a href="#day-plan" aria-label="Daylight, zum Tagesplan" className="rounded-full">
          <Logo />
        </a>
        <Badge variant="outline" className="ml-1 max-sm:hidden">
          Beispieltag
        </Badge>
        <div className="ml-auto">
          <Menu>
            <MenuTrigger
              render={<Button variant="ghost" size="icon" aria-label="Weitere Aktionen" />}
            >
              <Icon icon={MoreHorizontalIcon} size={20} />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem onClick={onStartCheckIn} disabled={busy}>
                <Icon icon={SunriseIcon} size={16} />
                Check-in starten
              </MenuItem>
              <MenuItem variant="destructive" onClick={() => setConfirmReset(true)} disabled={busy}>
                <Icon icon={ArrowReloadHorizontalIcon} size={16} />
                Beispieltag zurücksetzen
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      </div>
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Beispieltag zurücksetzen?</AlertDialogTitle>
            <AlertDialogDescription>
              Plan, Check-in und Rückgängig-Verlauf kehren zum Ausgangszustand zurück. Deine Serie
              und Abzeichen bleiben.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Abbrechen</AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmReset(false);
                onReset();
              }}
            >
              Zurücksetzen
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </header>
  );
}
