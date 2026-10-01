import { Badge, Card, type Tone } from "@agilityhub/ui";
import type { MouseEvent } from "react";

import { navigateInApp } from "../booking/shared";

import "./history.css";

/**
 * A plain click on the row's link moves in the app (`navigateInApp`), never a full page load
 * (E7-W06 step 2, E6-W04 review #8); a click that asks for another tab or window keeps the link's
 * own behaviour.
 */
function followInApp(event: MouseEvent<HTMLAnchorElement>, href: string): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  navigateInApp(href);
}

/**
 * One row of screen 25 (mockup V8): «{dl 28/07}» · «{títol} · amb {gos}» · the state badge, and
 * the detail line below. The one renderer of 25's rows: the page mounts it for every `HistoryItem`
 * and E4-W04's `ActivityHistoryRow` renders its S07 registrations through it. With `href` (an
 * activity whose page answers, E6-W04 step 0b) the title is a link that covers the whole row.
 */
export function HistoryRow({
  badge,
  date,
  detail,
  href,
  title,
}: {
  badge: { label: string; tone: Tone };
  date: string;
  detail?: string | undefined;
  href?: string | undefined;
  title: string;
}) {
  return (
    <Card className={href === undefined ? "history-row" : "history-row history-row--link"}>
      <div className="history-row__line">
        <span className="history-row__date">{date}</span>
        {href === undefined ? (
          <span className="history-row__title">{title}</span>
        ) : (
          <a
            className="history-row__title history-row__link"
            href={href}
            onClick={(event) => {
              followInApp(event, href);
            }}
          >
            {title}
          </a>
        )}
        <Badge className="history-row__badge" tone={badge.tone}>
          {badge.label}
        </Badge>
      </div>
      {detail === undefined ? null : <p className="history-row__detail">{detail}</p>}
    </Card>
  );
}
