import { Pulse01Icon, SmartWatch01Icon, SmartWatch03Icon } from '@hugeicons/core-free-icons';
import { Icon } from '../Icon';

/** Platzhalter: zeigt geplante Verbindungen, ohne irgendetwas zu verbinden. */
const wearables = [
  { name: 'WHOOP', detail: 'Schlaf und Erholung', icon: Pulse01Icon },
  { name: 'Oura', detail: 'Schlaf und Bereitschaft', icon: SmartWatch03Icon },
  { name: 'Apple Watch', detail: 'Aktivität und Schlaf', icon: SmartWatch01Icon },
  { name: 'Fitbit', detail: 'Schritte und Schlaf', icon: SmartWatch01Icon },
  { name: 'Ultrahuman', detail: 'Schlaf und Stoffwechsel', icon: Pulse01Icon },
];

export function WearableConnections() {
  return (
    <section
      className="rounded-xl border bg-card p-2 shadow-xs/5"
      aria-labelledby="wearables-title"
    >
      <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-2">
        <h2 id="wearables-title" className="text-lg font-semibold whitespace-nowrap">
          Verbindungen
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground">
          Bald verfügbar
        </span>
      </div>
      <ul className="grid gap-0.5" aria-label="Geplante Wearable-Verbindungen">
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
            <span className="text-xs whitespace-nowrap text-muted-foreground">Nicht verbunden</span>
          </li>
        ))}
      </ul>
      <p className="px-2 pt-2 pb-1 text-xs text-muted-foreground">
        Vorschau: Die Anbindungen sind noch nicht umgesetzt. Der Check-in bleibt manuell.
      </p>
    </section>
  );
}
