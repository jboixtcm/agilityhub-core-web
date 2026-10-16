/**
 * The viewer's 3D tab (S16 §2, loaded on demand): its own chunk, so three.js and the FBX loader
 * reach only whoever opens the tab, never the members' app start.
 */
import type { CourseData, CoursePlacement } from "@agilityhub/course-core";
import { Planner3D, type PlannerRing } from "@agilityhub/course-ui";
import { useState } from "react";

export default function CourseViewer3D({
  ariaLabel,
  course,
  placement,
  ring,
}: {
  ariaLabel: string;
  course: CourseData;
  placement: CoursePlacement;
  ring: PlannerRing;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="course-viewer__3d">
      <Planner3D
        ariaLabel={ariaLabel}
        course={course}
        onSelectObstacle={setSelected}
        placement={placement}
        ring={ring}
        selectedObstacleId={selected}
        warnings={[]}
      />
    </div>
  );
}
