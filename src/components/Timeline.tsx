import {
  BookOpen01Icon,
  WorkIcon,
  Sun03Icon,
  Dumbbell01Icon,
  UserMultiple02Icon,
  LockKeyIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import {
  categoryLabels,
  formatTime,
  hasItemChanged,
  type Category,
  type Plan,
  type ModelResult,
} from '../../shared/contracts';
import { Icon } from './Icon';

const icons: Record<Category, typeof BookOpen01Icon> = {
  study: BookOpen01Icon,
  work: WorkIcon,
  recovery: Sun03Icon,
  movement: Dumbbell01Icon,
  social: UserMultiple02Icon,
};

export function Timeline({
  plan,
  original,
  result,
  label,
}: {
  plan: Plan;
  original?: Plan;
  result?: ModelResult;
  label: string;
}) {
  const scheduled = plan.items
    .filter((item) => item.start !== null)
    .toSorted((a, b) => a.start! - b.start!);
  const deferred = plan.items.filter((item) => item.start === null);
  return (
    <section className={`timeline ${original ? 'proposed-timeline' : ''}`} aria-label={label}>
      <div className="timeline-heading">
        <h3>{label}</h3>
        <span>{scheduled.filter((item) => item.start! >= plan.now).length} Blöcke vor dir</span>
      </div>
      {plan.availableFrom > plan.now && (
        <p className="availability-note">Verfügbar ab {formatTime(plan.availableFrom)}</p>
      )}
      <ol className="schedule-list">
        {scheduled.map((item, index) => {
          const before = original?.items.find((source) => source.id === item.id);
          const changed = Boolean(original) && hasItemChanged(before, item);
          const past = item.start! + item.duration <= plan.now;
          const previousEnd = index
            ? scheduled[index - 1].start! + scheduled[index - 1].duration
            : plan.dayStart;
          const gap = item.start! - Math.max(previousEnd, plan.now, plan.availableFrom);
          return (
            <li key={item.id} className={past ? 'past-item' : ''}>
              {gap >= 15 && (
                <div className="time-gap">
                  <span />
                  {gap} Min. Spielraum
                </div>
              )}
              <div className="schedule-row">
                <div className="time-label">
                  <time>{formatTime(item.start!)}</time>
                  <span>{formatTime(item.start! + item.duration)}</span>
                </div>
                <article
                  className={`time-block category-${item.category} ${item.fixed ? 'fixed-block' : ''} ${changed ? 'changed-block' : ''}`}
                >
                  <div className="block-topline">
                    <span className="category-name">
                      <Icon icon={icons[item.category]} size={16} />
                      {categoryLabels[item.category]}
                    </span>
                    <span className="block-kind">
                      {past ? (
                        <>
                          <Icon icon={Tick02Icon} size={13} />
                          Vergangen
                        </>
                      ) : item.fixed ? (
                        <>
                          <Icon icon={LockKeyIcon} size={13} />
                          Fest
                        </>
                      ) : (
                        'Flexibel'
                      )}
                    </span>
                  </div>
                  <h4>{item.title}</h4>
                  <div className="block-details">
                    <span>{item.duration} Min.</span>
                    {item.priority === 'high' && <span>Hohe Priorität</span>}
                    {item.deadline !== null && <span>Frist {formatTime(item.deadline)}</span>}
                  </div>
                  {changed && (
                    <p className="change-note">
                      {!before
                        ? 'Neu hinzugefügt'
                        : before.title !== item.title
                          ? `Vorher „${before.title}“`
                          : before.duration !== item.duration
                            ? `Vorher ${before.duration} Min.`
                            : before.start === null
                              ? 'Neu eingeplant'
                              : before.start !== item.start
                                ? `Vorher ${formatTime(before.start)}`
                                : 'Aufgabe bearbeitet'}
                      <span> · </span>
                      {result?.placements.find((placement) => placement.id === item.id)?.reason}
                    </p>
                  )}
                </article>
              </div>
            </li>
          );
        })}
      </ol>
      {deferred.length > 0 && (
        <div className="deferred-list">
          <h4>
            Heute offen <span>{deferred.length}</span>
          </h4>
          <p>Diese Aufgaben sind noch für keinen anderen Tag eingeplant.</p>
          {deferred.map((item) => (
            <div className="deferred-item" key={item.id}>
              <Icon icon={icons[item.category]} size={18} />
              <div>
                <strong>{item.title}</strong>
                <span>
                  {item.duration} Min.
                  {result
                    ? ` · ${result.placements.find((placement) => placement.id === item.id)?.reason ?? ''}`
                    : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="day-end">
        <span />
        Feierabend um {formatTime(plan.dayEnd)}
      </div>
    </section>
  );
}
