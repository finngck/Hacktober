import {
  BookOpen01Icon,
  WorkIcon,
  Sun03Icon,
  Dumbbell01Icon,
  UserMultiple02Icon,
  LockKeyIcon,
  Target02Icon,
  SunsetIcon,
  DragDropVerticalIcon,
} from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { cva } from 'class-variance-authority';
import {
  categoryLabels,
  formatTime,
  hasItemChanged,
  type Category,
  type ModelResult,
  type Plan,
  type ScheduleItem,
} from '../../../shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Icon } from '../Icon';

export const categoryIcons: Record<Category, typeof BookOpen01Icon> = {
  study: BookOpen01Icon,
  work: WorkIcon,
  recovery: Sun03Icon,
  movement: Dumbbell01Icon,
  social: UserMultiple02Icon,
};
/** Block colour by priority: the more important, the darker the olive. */
const priorityTint: Record<ScheduleItem['priority'], string> = {
  high: 'border-priority-high bg-priority-high text-priority-high-foreground',
  medium: 'border-priority-medium bg-priority-medium',
  low: 'border-priority-low bg-priority-low',
};

function RailSegment({ past }: { from?: number; to?: number; past?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('w-px justify-self-center bg-border', past && 'opacity-50')}
    />
  );
}

/** Dragging the handle by this many pixels moves a block by 15 minutes. */
const dragStep = 16;

export type BlockActions = {
  onEdit: (item: ScheduleItem) => void;
  onMove: (id: string, start: number) => void;
};

const timeBlock = cva(
  'relative grid gap-0.5 overflow-hidden rounded-lg border px-3 py-2.5 transition-[opacity,box-shadow,filter]',
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
  actions,
  bounds,
}: {
  item: ScheduleItem;
  state: 'upcoming' | 'past' | 'changed';
  focus: boolean;
  note?: string;
  actions?: BlockActions;
  /** Earliest and latest start a drag may reach; absent for blocks that already started. */
  bounds?: { min: number; max: number };
}) {
  const [drag, setDrag] = useState<{ from: number; offset: number } | null>(null);
  const subtle = {
    high: 'text-priority-high-foreground/75',
    medium: 'text-foreground/70',
    low: 'text-muted-foreground',
  }[item.priority];
  const clamp = (start: number) =>
    bounds ? Math.min(bounds.max, Math.max(bounds.min, start)) : start;
  const target = drag ? clamp(item.start! + Math.round(drag.offset / dragStep) * 15) : item.start;
  const move = (start: number) => {
    if (actions && start !== item.start) actions.onMove(item.id, start);
  };
  return (
    <article
      className={cn(
        timeBlock({ state }),
        priorityTint[item.priority],
        actions && 'hover:brightness-95',
        drag && 'z-20 shadow-lg',
      )}
      style={drag ? { translate: `0 ${drag.offset}px` } : undefined}
    >
      {actions && (
        <Button
          variant="ghost"
          type="button"
          className="absolute inset-0 h-full w-full cursor-pointer rounded-lg p-0 hover:bg-transparent"
          aria-label={`Edit “${item.title}”`}
          onClick={() => actions.onEdit(item)}
        />
      )}
      {actions && bounds && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1.5 right-1.5 z-10 cursor-grab touch-none text-current active:cursor-grabbing"
          aria-label={`Move “${item.title}”. Arrow keys move it by 15 minutes.`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag({ from: event.clientY, offset: 0 });
          }}
          onPointerMove={(event) => drag && setDrag({ ...drag, offset: event.clientY - drag.from })}
          onPointerUp={() => {
            if (drag && target !== null) move(target);
            setDrag(null);
          }}
          onPointerCancel={() => setDrag(null)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            move(clamp(item.start! + (event.key === 'ArrowDown' ? 15 : -15)));
          }}
        >
          <Icon icon={DragDropVerticalIcon} size={16} />
        </Button>
      )}
      <div
        className={cn(
          'pointer-events-none flex flex-wrap items-center gap-x-2 gap-y-1 text-xs',
          actions && bounds && 'pr-8',
        )}
      >
        <span className="inline-flex items-center gap-1 font-medium">
          <Icon icon={categoryIcons[item.category]} size={14} />
          {categoryLabels[item.category]}
        </span>
        {item.fixed && (
          <span className={cn('inline-flex items-center gap-1', subtle)}>
            <Icon icon={LockKeyIcon} size={12} />
            Fixed
          </span>
        )}
        {focus && (
          <Badge variant="outline" size="sm">
            <Icon icon={Target02Icon} size={12} />
            Focus
          </Badge>
        )}
      </div>
      <h3 className="text-sm leading-snug font-semibold">{item.title}</h3>
      <p className={cn('text-xs', subtle)}>
        {[
          `${item.duration}\u00a0min`,
          item.priority === 'high' ? 'High priority' : '',
          item.deadline !== null ? `Deadline ${formatTime(item.deadline)}` : '',
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {note && <p className="text-xs font-medium">{note}</p>}
      {drag && target !== null && target !== item.start && (
        <p className="text-xs font-semibold" aria-live="polite">
          New: {formatTime(target)}–{formatTime(target + item.duration)}
        </p>
      )}
    </article>
  );
}

function changeLabel(before: ScheduleItem | undefined, item: ScheduleItem) {
  if (!before) return 'Newly added';
  if (before.title !== item.title) return `Previously "${before.title}"`;
  if (before.duration !== item.duration) return `Previously ${before.duration}\u00a0min`;
  if (before.start === null) return 'Newly scheduled';
  if (before.start !== item.start) return `Previously ${formatTime(before.start)}`;
  return 'Task edited';
}

export function Timeline({
  plan,
  original,
  result,
  focusTaskId,
  label,
  actions,
}: {
  plan: Plan;
  original?: Plan;
  result?: ModelResult;
  focusTaskId: string | null;
  label: string;
  /** Makes blocks of the active plan editable and draggable; proposals stay read-only. */
  actions?: BlockActions;
}) {
  const earliest = Math.max(plan.now, plan.availableFrom, plan.dayStart);
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
          const changed = Boolean(original) && hasItemChanged(before, item);
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
                    Now
                    <span className="flex-1 border-t border-dotted border-foreground/50" />
                  </span>
                </div>
              )}
              {gap >= 15 && (
                <div className="grid grid-cols-[3rem_0.75rem_1fr] gap-x-3">
                  <span />
                  <RailSegment from={gapStart} to={item.start!} />
                  <span className="py-2 text-sm text-muted-foreground">{gap}&nbsp;min free</span>
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
                    actions={actions}
                    bounds={
                      item.start! >= plan.now
                        ? { min: earliest, max: plan.dayEnd - item.duration }
                        : undefined
                    }
                    note={
                      changed
                        ? `${changeLabel(before, item)}. ${reasonFor(item.id) ?? ''}`
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
        <span className="text-sm text-muted-foreground">Day ends</span>
      </div>
      {deferred.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed p-4">
          <h3 className="font-semibold">
            Open today <span className="text-muted-foreground">{deferred.length}</span>
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            No time slot yet and not scheduled for another day.
          </p>
          <ul className="grid gap-2">
            {deferred.map((item) => (
              <li key={item.id} className="flex gap-3">
                <Icon
                  icon={categoryIcons[item.category]}
                  size={18}
                  className="mt-0.5 text-priority-high"
                />
                <span className="grid">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {[`${item.duration}\u00a0min`, result ? reasonFor(item.id) : '']
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
