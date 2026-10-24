import { useRef, type ReactNode } from 'react';
import {
  ArrowRight01Icon,
  BatteryMedium01Icon,
  CheckmarkCircle02Icon,
  FireIcon,
  Moon02Icon,
  Settings02Icon,
  Target02Icon,
  AiBrain01Icon,
  Award01Icon,
  LockKeyIcon,
} from '@hugeicons/core-free-icons';
import type { CheckIn, Plan } from '../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';
import {
  badgeOrder,
  badges,
  checkedInToday,
  nextStreakGoal,
  streak,
  type Progress as ProgressState,
} from '@/lib/progress';
import { cn } from '@/lib/utils';
import { Icon } from '../Icon';
import {
  EnergyControl,
  FocusControl,
  MoodControl,
  PreferencesControl,
  SleepControl,
  StressControl,
} from './CheckInControls';
import { checkInSummary, firstControl, moodIcons } from './checkInOptions';

function CheckInRow({
  icon,
  label,
  value,
  title,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  title: string;
  children: ReactNode;
}) {
  const popup = useRef<HTMLDivElement>(null);
  return (
    <Popover>
      <PopoverTrigger
        className="group flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent data-popup-open:bg-accent"
        aria-label={`${label}: ${value}. Ändern`}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-foreground transition-transform group-active:scale-95 lg:size-9">
          {icon}
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="truncate font-medium">{value}</span>
        </span>
        <Icon
          icon={ArrowRight01Icon}
          size={16}
          className="text-muted-foreground transition-transform group-hover:translate-x-0.5 max-lg:hidden"
        />
      </PopoverTrigger>
      <PopoverPopup
        ref={popup}
        initialFocus={() => firstControl(popup.current)}
        side="right"
        align="start"
        sideOffset={12}
        className="w-[min(22rem,90vw)]"
      >
        <PopoverTitle className="mb-3 font-heading text-lg">{title}</PopoverTitle>
        {children}
      </PopoverPopup>
    </Popover>
  );
}

export function CheckInSidebar({
  checkIn,
  plan,
  progress,
  disabled,
  onChange,
  onStartFlow,
}: {
  checkIn: CheckIn;
  plan: Plan;
  progress: ProgressState;
  disabled: boolean;
  onChange: (patch: Partial<CheckIn>) => void;
  onStartFlow: () => void;
}) {
  const summary = checkInSummary(checkIn, plan);
  const done = checkedInToday(progress);
  const days = streak(progress);
  const goal = nextStreakGoal(days);
  return (
    <aside className="grid content-start gap-4" aria-label="Daily Check-in und Erfolge">
      <section
        className="rounded-2xl border bg-card p-3 shadow-xs/5"
        aria-labelledby="check-in-title"
      >
        <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-2">
          <h2 id="check-in-title" className="text-lg font-semibold whitespace-nowrap">
            Daily Check-in
          </h2>
          {done ? (
            <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-success-foreground">
              <Icon icon={CheckmarkCircle02Icon} size={14} />
              Erledigt
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-sun-ink">
              <span className="size-2 animate-glow rounded-full bg-sun" />
              Offen
            </span>
          )}
        </div>
        <fieldset
          disabled={disabled}
          className="grid grid-cols-2 gap-0.5 disabled:opacity-64 sm:grid-cols-3 lg:grid-cols-1"
        >
          <legend className="sr-only">Dein Check-in</legend>
          <CheckInRow
            icon={<Icon icon={Moon02Icon} size={18} />}
            label="Schlaf"
            value={summary.sleep}
            title="Schlaf"
          >
            <SleepControl checkIn={checkIn} onChange={onChange} />
          </CheckInRow>
          <CheckInRow
            icon={<Icon icon={BatteryMedium01Icon} size={18} />}
            label="Energie"
            value={summary.energy}
            title="Energie"
          >
            <EnergyControl checkIn={checkIn} onChange={onChange} />
          </CheckInRow>
          <CheckInRow
            icon={<Icon icon={moodIcons[checkIn.mood - 1]} size={18} />}
            label="Stimmung"
            value={summary.mood}
            title="Stimmung"
          >
            <MoodControl checkIn={checkIn} onChange={onChange} />
          </CheckInRow>
          <CheckInRow
            icon={<Icon icon={AiBrain01Icon} size={18} />}
            label="Kopf"
            value={summary.stress}
            title="Stress"
          >
            <StressControl checkIn={checkIn} onChange={onChange} />
          </CheckInRow>
          <CheckInRow
            icon={<Icon icon={Target02Icon} size={18} />}
            label="Fokus"
            value={summary.focus}
            title="Fokus für heute"
          >
            <FocusControl checkIn={checkIn} onChange={onChange} plan={plan} />
          </CheckInRow>
          <CheckInRow
            icon={<Icon icon={Settings02Icon} size={18} />}
            label="Präferenzen"
            value={summary.preferences}
            title="Präferenzen"
          >
            <PreferencesControl checkIn={checkIn} onChange={onChange} />
          </CheckInRow>
        </fieldset>
        <Button
          variant={done ? 'ghost' : 'default'}
          className="mt-2 w-full"
          onClick={onStartFlow}
          disabled={disabled}
        >
          {done ? 'Check-in erneut durchgehen' : 'Check-in starten'}
        </Button>
      </section>

      <section
        className="rounded-2xl border bg-card p-4 shadow-xs/5"
        aria-labelledby="streak-title"
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'grid size-11 place-items-center rounded-full',
              days ? 'bg-sun text-sun-ink' : 'bg-muted text-muted-foreground',
            )}
          >
            <Icon icon={FireIcon} size={22} />
          </span>
          <div className="grid">
            <h2 id="streak-title" className="text-xl leading-tight font-semibold tabular">
              {days === 1 ? '1 Tag' : `${days} Tage`}
            </h2>
            <span className="text-sm text-muted-foreground">Check-in-Serie</span>
          </div>
        </div>
        <Progress
          value={(days / goal) * 100}
          className="mt-3"
          aria-label="Fortschritt zur nächsten Serie"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Noch {goal - days} {goal - days === 1 ? 'Tag' : 'Tage'} bis {goal} in Folge
        </p>
        <ul className="mt-4 grid grid-cols-6 gap-1.5" aria-label="Abzeichen">
          {badgeOrder.map((id) => {
            const unlocked = progress.badges.includes(id);
            return (
              <li key={id}>
                <Tooltip>
                  <TooltipTrigger
                    className={cn(
                      'grid aspect-square w-full place-items-center rounded-full transition-transform hover:scale-105',
                      unlocked ? 'bg-sun/30 text-sun-ink' : 'bg-muted text-muted-foreground/60',
                    )}
                    aria-label={`${badges[id].title}${unlocked ? '' : ' (noch gesperrt)'}: ${badges[id].description}`}
                  >
                    <Icon icon={unlocked ? Award01Icon : LockKeyIcon} size={unlocked ? 18 : 14} />
                  </TooltipTrigger>
                  <TooltipPopup>
                    <strong>{badges[id].title}</strong>
                    <br />
                    {badges[id].description}
                  </TooltipPopup>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}
