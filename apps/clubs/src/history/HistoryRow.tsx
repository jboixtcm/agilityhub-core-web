import { Badge, Card, type Tone } from "@agilityhub/ui";

import "./history.css";

/**
 * One row of screen 25 (mockup V8): «{dl 28/07}» · «{títol} · amb {gos}» · the state badge, and
 * the detail line below. The one renderer of 25's rows: the page mounts it for every `HistoryItem`
 * and E4-W04's `ActivityHistoryRow` renders its S07 registrations through it.
 */
export function HistoryRow({
  badge,
  date,
  detail,
  title,
}: {
  badge: { label: string; tone: Tone };
  date: string;
  detail?: string | undefined;
  title: string;
}) {
  return (
    <Card className="history-row">
      <div className="history-row__line">
        <span className="history-row__date">{date}</span>
        <span className="history-row__title">{title}</span>
        <Badge className="history-row__badge" tone={badge.tone}>
          {badge.label}
        </Badge>
      </div>
      {detail === undefined ? null : <p className="history-row__detail">{detail}</p>}
    </Card>
  );
}
