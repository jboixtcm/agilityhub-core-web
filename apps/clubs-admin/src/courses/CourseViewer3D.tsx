/**
 * D18's 3D tab (`CourseViewer3D`, S16 §2: loaded on demand). Its own chunk: three.js and the FBX
 * loader reach only the admins who open the tab.
 */
import type { CourseData, CoursePlacement, Warning } from "@agilityhub/course-core";
import { Planner3D, type PlannerRing } from "@agilityhub/course-ui";
import { useState } from "react";

export default function CourseViewer3D({
  ariaLabel,
  course,
  placement,
  ring,
  warnings = [],
}: {
  ariaLabel: string;
  course: CourseData;
  placement: CoursePlacement;
  ring: PlannerRing;
  warnings?: readonly Warning[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="courses-viewer-3d">
      <Planner3D
        ariaLabel={ariaLabel}
        course={course}
        onSelectObstacle={setSelected}
        placement={placement}
        ring={ring}
        selectedObstacleId={selected}
        warnings={warnings}
      />
    </div>
  );
}
