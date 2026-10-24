import {
  BookOpen01Icon,
  WorkIcon,
  Sun03Icon,
  Dumbbell01Icon,
  UserMultiple02Icon,
  LockKeyIcon,
  Target02Icon,
  SunsetIcon,
} from '@hugeicons/core-free-icons';
import { cva } from 'class-variance-authority';
import {
  categoryLabels,
  formatTime,
  type Category,
  type ModelResult,
  type Plan,
  type ScheduleItem,
} from '../../../shared/contracts';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Icon } from '../Icon';

export const categoryIcons: Record<Category, typeof BookOpen01Icon> = {
  study: BookOpen01Icon,
  work: WorkIcon,
  recovery: Sun03Icon,
  movement: Dumbbell01Icon,
  social: UserMultiple02Icon,
};
const categoryText: Record<Category, string> = {
  study: 'text-category-study',
  work: 'text-category-work',
  recovery: 'text-category-recovery',
  movement: 'text-category-movement',
  social: 'text-category-social',
};
/** Event-style tint per category, as in coss calendar cards. */
const categoryTint: Record<Category, string> = {
  study: 'border-category-study/25 bg-category-study/6',
  work: 'border-category-work/25 bg-category-work/6',
  recovery: 'border-category-recovery/25 bg-category-recovery/6',
  movement: 'border-category-movement/25 bg-category-movement/6',
  social: 'border-category-social/25 bg-category-social/6',
};

function RailSegment({ past }: { from?: number; to?: number; past?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('w-px justify-self-center bg-border', past && 'opacity-50')}
    />
  );
}

const timeBlock = cva(
  'relative grid gap-0.5 overflow-hidden rounded-lg border px-3 py-2.5 transition-[opacity,box-shadow]',
  {
    variants: {
      state: {
        upcoming: '',
        past: 'opacity-50',
        changed: 'ring-2 ring-primary/70 ring-offset-1 ring-offset-card',
      },
    },
    defaultVariants: { state: 'upcoming' },
  },
);

function TimeBlock({
  item,
  state,
  focus,
  note,
}: {
  item: ScheduleItem;
  state: 'upcoming' | 'past' | 'changed';
  focus: boolean;
  note?: string;
}) {
  return (
    <article className={cn(timeBlock({ state }), categoryTint[item.category])}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span
          className={cn('inline-flex items-center gap-1 font-medium', categoryText[item.category])}
        >
          <Icon icon={categoryIcons[item.category]} size={14} />
          {categoryLabels[item.category]}
        </span>
        {item.fixed && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Icon icon={LockKeyIcon} size={12} />
            Fest
          </span>
        )}
        {focus && (
          <Badge variant="outline" size="sm">
            <Icon icon={Target02Icon} size={12} />
            Fokus
          </Badge>
        )}
      </div>
      <h3 className="text-sm leading-snug font-semibold">{item.title}</h3>
      <p className="text-xs text-muted-foreground">
        {[
          `${item.duration}\u00a0Min.`,
          item.priority === 'high' ? 'Hohe Priorität' : '',
          item.deadline !== null ? `Frist ${formatTime(item.deadline)}` : '',
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {note && <p className="text-xs font-medium text-foreground">{note}</p>}
    </article>
  );
}

export function Timeline({
  plan,
  original,
  result,
  focusTaskId,
  label,
}: {
  plan: Plan;
  original?: Plan;
  result?: ModelResult;
  focusTaskId: string | null;
  label: string;
}) {
  const scheduled = plan.items
    .filter((item) => item.start !== null)
    .toSorted((a, b) => a.start! - b.start!);
  const deferred = plan.items.filter((item) => item.start === null);
  const reasonFor = (id: string) =>
    result?.placements.find((placement) => placement.id === id)?.reason;
  const firstUpcoming = scheduled.findIndex((item) => item.start! + item.duration > plan.now);
  return (
    <section aria-label={label} className="grid gap-1">
      <ol className="grid">
        {scheduled.map((item, index) => {
          const before = original?.items.find((source) => source.id === item.id);
          const changed = before !== undefined && before.start !== item.start;
          const end = item.start! + item.duration;
          const past = end <= plan.now;
          const previousEnd = index
            ? scheduled[index - 1].start! + scheduled[index - 1].duration
            : plan.dayStart;
          const gapStart = Math.max(previousEnd, plan.now, plan.availableFrom);
          const gap = item.start! - gapStart;
          return (
            <li key={item.id} className="grid">
              {index === firstUpcoming && (
                <div className="grid grid-cols-[3rem_0.75rem_1fr] items-center gap-x-3 py-2">
                  <time className="text-right text-xs font-semibold">{formatTime(plan.now)}</time>
                  <span className="size-2 justify-self-center rounded-full bg-foreground" />
                  <span className="flex items-center gap-2 text-xs font-medium">
                    Jetzt
                    <span className="flex-1 border-t border-dotted border-foreground/50" />
                  </span>
                </div>
              )}
              {gap >= 15 && (
                <div className="grid grid-cols-[3rem_0.75rem_1fr] gap-x-3">
                  <span />
                  <RailSegment from={gapStart} to={item.start!} />
                  <span className="py-2 text-sm text-muted-foreground">{gap}&nbsp;Min. frei</span>
                </div>
              )}
              <div className="grid grid-cols-[3rem_0.75rem_1fr] gap-x-3">
                <div className="grid content-start pt-3 text-right">
                  <time className="text-sm font-semibold">{formatTime(item.start!)}</time>
                  <time className="text-xs text-muted-foreground">{formatTime(end)}</time>
                </div>
                <RailSegment from={item.start!} to={end} past={past} />
                <div className="py-1">
                  <TimeBlock
                    item={item}
                    state={past ? 'past' : changed ? 'changed' : 'upcoming'}
                    focus={item.id === focusTaskId}
                    note={
                      changed
                        ? `${before.start === null ? 'Neu eingeplant' : `Vorher ${formatTime(before.start)}`}. ${reasonFor(item.id) ?? ''}`
                        : undefined
                    }
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="grid grid-cols-[3rem_0.75rem_1fr] items-center gap-x-3 py-2">
        <time className="text-right text-sm text-muted-foreground">{formatTime(plan.dayEnd)}</time>
        <Icon icon={SunsetIcon} size={18} className="justify-self-center text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Feierabend</span>
      </div>
      {deferred.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed p-4">
          <h3 className="font-semibold">
            Heute offen <span className="text-muted-foreground">{deferred.length}</span>
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Noch ohne Zeitfenster und für keinen anderen Tag eingeplant.
          </p>
          <ul className="grid gap-2">
            {deferred.map((item) => (
              <li key={item.id} className="flex gap-3">
                <Icon
                  icon={categoryIcons[item.category]}
                  size={18}
                  className={cn('mt-0.5', categoryText[item.category])}
                />
                <span className="grid">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {[`${item.duration}\u00a0Min.`, result ? reasonFor(item.id) : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
