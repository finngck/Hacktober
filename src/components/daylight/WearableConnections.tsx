import { Pulse01Icon, SmartWatch01Icon, SmartWatch03Icon } from '@hugeicons/core-free-icons';
import { Icon } from '../Icon';

/** Placeholder: shows planned connections without connecting anything. */
const wearables = [
  { name: 'WHOOP', detail: 'Sleep and recovery', icon: Pulse01Icon },
  { name: 'Oura', detail: 'Sleep and readiness', icon: SmartWatch03Icon },
  { name: 'Apple Watch', detail: 'Activity and sleep', icon: SmartWatch01Icon },
  { name: 'Fitbit', detail: 'Steps and sleep', icon: SmartWatch01Icon },
  { name: 'Ultrahuman', detail: 'Sleep and metabolism', icon: Pulse01Icon },
];

export function WearableConnections() {
  return (
    <section
      className="rounded-xl border bg-card p-2 shadow-xs/5"
      aria-labelledby="wearables-title"
    >
      <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-2">
        <h2 id="wearables-title" className="text-lg font-semibold whitespace-nowrap">
          Connections
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground">
          Coming soon
        </span>
      </div>
      <ul className="grid gap-0.5" aria-label="Planned wearable connections">
        {wearables.map((wearable) => (
          <li
            key={wearable.name}
            className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5 opacity-70"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-background lg:size-9">
              <Icon icon={wearable.icon} size={18} />
            </span>
            <span className="grid min-w-0 flex-1">
              <span className="truncate text-sm font-medium">{wearable.name}</span>
              <span className="truncate text-xs text-muted-foreground">{wearable.detail}</span>
            </span>
            <span className="text-xs whitespace-nowrap text-muted-foreground">Not connected</span>
          </li>
        ))}
      </ul>
      <p className="px-2 pt-2 pb-1 text-xs text-muted-foreground">
        Preview: these integrations are not built yet. The check-in stays manual.
      </p>
    </section>
  );
}
