import { PlannerCanvas } from "@agilityhub/course-ui";
import { Button, IconButton, Skeleton } from "@agilityhub/ui";
import { type CSSProperties, lazy, Suspense, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ViewerScene } from "./viewer-model";

const CourseViewer3D = lazy(() => import("./CourseViewer3D"));

const ZOOMS = [1, 1.5, 2, 3] as const;

/**
 * The course drawn read-only (S16 §2 «visor 2D … (zoom i gir)»; R-16-09: a MEMBER sees the
 * numbering and the obstacles, never the editor): the 2D plan with zoom and a quarter turn, and a
 * 3D tab loaded on demand.
 */
export function CourseViewer({ name, scene }: { name: string; scene: ViewerScene }) {
  const { t } = useTranslation("courses");
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [zoom, setZoom] = useState(0);
  const [turns, setTurns] = useState(0);
  const select = useCallback(() => undefined, []);
  const scale = ZOOMS[zoom] ?? 1;
  const style = {
    "--course-viewer-rotate": `${String(turns * 90)}deg`,
    "--course-viewer-scale": String(scale),
  } as CSSProperties;

  return (
    <div className="course-viewer">
      <div aria-label={t("courses:viewer.mode")} className="course-viewer__modes" role="group">
        {(["2d", "3d"] as const).map((value) => (
          <button
            aria-pressed={mode === value}
            className={`ah-chip training-chip${mode === value ? " training-chip--selected" : ""}`}
            key={value}
            onClick={() => {
              setMode(value);
            }}
            type="button"
          >
            {value === "2d" ? t("courses:viewer.view2d") : t("courses:viewer.view3d")}
          </button>
        ))}
      </div>
      {mode === "2d" ? (
        <>
          <div className="course-viewer__frame" data-testid="course-viewer-2d">
            <div className="course-viewer__plan" style={style}>
              <PlannerCanvas
                course={scene.course}
                labels={{
                  ariaLabel: t("courses:viewer.plan", { name }),
                  entry: t("courses:viewer.entry"),
                  exit: t("courses:viewer.exit"),
                }}
                onSelectObstacle={select}
                placement={scene.placement}
                ring={scene.ring}
                selectedObstacleId={null}
                warnings={[]}
              />
            </div>
          </div>
          <div className="course-viewer__tools">
            <Button
              aria-label={t("courses:viewer.zoomOut")}
              className="course-viewer__tool"
              disabled={zoom === 0}
              onClick={() => {
                setZoom((value) => Math.max(0, value - 1));
              }}
              variant="secondary"
            >
              <span aria-hidden="true">{t("courses:viewer.zoomOutGlyph")}</span>
            </Button>
            <span aria-live="polite" className="course-viewer__zoom">
              {t("courses:viewer.zoom", { percent: Math.round(scale * 100) })}
            </span>
            <Button
              aria-label={t("courses:viewer.zoomIn")}
              className="course-viewer__tool"
              disabled={zoom === ZOOMS.length - 1}
              onClick={() => {
                setZoom((value) => Math.min(ZOOMS.length - 1, value + 1));
              }}
              variant="secondary"
            >
              <span aria-hidden="true">{t("courses:viewer.zoomInGlyph")}</span>
            </Button>
            <IconButton
              className="course-viewer__tool"
              icon="undo"
              label={t("courses:viewer.rotate")}
              onClick={() => {
                setTurns((value) => (value + 1) % 4);
              }}
              variant="secondary"
            />
          </div>
        </>
      ) : (
        <Suspense fallback={<Skeleton height="16rem" label={t("courses:viewer.loading3d")} />}>
          <CourseViewer3D
            ariaLabel={t("courses:viewer.plan3d", { name })}
            course={scene.course}
            placement={scene.placement}
            ring={scene.ring}
          />
        </Suspense>
      )}
    </div>
  );
}
