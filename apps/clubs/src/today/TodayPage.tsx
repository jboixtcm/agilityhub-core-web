import type { ApiClient } from "@agilityhub/api-client";
import { Card, DayGrid, useBranding } from "@agilityhub/ui";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import "./today.css";
import {
  DayGridError,
  DayGridLoading,
  DayScreen,
  DayScreenHeader,
  mapDayGrid,
  useGridLabels,
} from "./shared";
import { useDayGrid } from "./useDayGrid";

interface Balloon {
  arrow: number;
  cellId: string;
  element: HTMLElement;
  text: string;
}

/** Screen 10 «Classes del dia» (`/avui`): member view of form D, risk balloon, never a count. */
export function TodayPage({ client }: { client: ApiClient }) {
  const branding = useBranding();
  const { t } = useTranslation(["home", "enums", "instructor"]);
  const labels = useGridLabels();
  const day = useDayGrid(client, "member");
  const [balloon, setBalloon] = useState<Balloon>();
  const balloonRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const mapped = useMemo(
    () =>
      day.grid === undefined
        ? undefined
        : mapDayGrid(
            day.grid,
            t,
            (cell) =>
              cell.kind === "CLASS" &&
              cell.atRisk === true &&
              cell.riskText !== null &&
              cell.riskText !== undefined,
          ),
    [day.grid, t],
  );

  useEffect(() => {
    if (balloon === undefined) return undefined;
    const close = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (
        target !== null &&
        (balloon.element.contains(target) || balloonRef.current?.contains(target) === true)
      ) {
        return;
      }
      setBalloon(undefined);
    };
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
    };
  }, [balloon]);

  return (
    <DayScreen>
      <DayScreenHeader
        date={day.date}
        onDateChange={(date) => {
          setBalloon(undefined);
          day.setDate(date);
        }}
        title={t("home:today.title")}
      />
      {day.status === "error" ? <DayGridError onRetry={day.refetch} /> : null}
      {day.status === "loading" ? <DayGridLoading /> : null}
      {mapped === undefined ? null : (
        <div className="day-screen__member" ref={cardRef}>
          <Card className="day-screen__card">
            {mapped.rows.length === 0 ? (
              <p className="day-screen__empty">{t("home:today.empty")}</p>
            ) : (
              <DayGrid
                columns={mapped.columns}
                labels={labels}
                onCellPress={(cell, element) => {
                  if (balloon?.cellId === cell.id) {
                    setBalloon(undefined);
                    return;
                  }
                  const text = mapped.cellsById.get(cell.id)?.riskText;
                  if (text === null || text === undefined) return;
                  const card = cardRef.current?.getBoundingClientRect();
                  const rect = element.getBoundingClientRect();
                  setBalloon({
                    arrow: rect.left + rect.width / 2 - (card?.left ?? 0),
                    cellId: cell.id,
                    element,
                    text,
                  });
                }}
                rows={mapped.rows}
                showWaiting={branding.modules.includes("WAITLIST")}
                view="member"
              />
            )}
            <p className="day-screen__footer">{t("home:today.footer")}</p>
          </Card>
          {balloon === undefined ? null : (
            <div
              className="day-screen__balloon"
              ref={balloonRef}
              role="status"
              style={{ "--day-balloon-arrow": `${String(balloon.arrow)}px` } as CSSProperties}
            >
              {balloon.text}
            </div>
          )}
        </div>
      )}
    </DayScreen>
  );
}
