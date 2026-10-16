/**
 * The S16 back-office screens (E9-W03) as one chunk, loaded when an admin opens them: D18's
 * library (`/recorreguts`), a course (`/recorreguts/:id`), the placement editor
 * (`/recorreguts/:id/col-locacio?colocacio=…&activitat=…`) and D16 «Geometria»
 * (`/pistes/:id/geometria`). course-core and course-ui reach only these admins.
 */
import type { ApiClient } from "@agilityhub/api-client";

import "./courses.css";
import { CourseDetailPage } from "./CourseDetailPage";
import { CoursesPage } from "./CoursesPage";
import { PlacementEditorPage } from "./PlacementEditorPage";
import { RingGeometryPage } from "./RingGeometryPage";

export default function CoursesRoute({
  client,
  onNavigate,
  pathname,
  search,
}: {
  client: ApiClient;
  onNavigate: (path: string) => void;
  pathname: string;
  search: string;
}) {
  const [section = "", id, view] = pathname.split("/").filter((segment) => segment !== "");
  if (section === "pistes" && id !== undefined) {
    return (
      <RingGeometryPage
        client={client}
        key={id}
        onNavigate={onNavigate}
        ringId={decodeURIComponent(id)}
      />
    );
  }
  if (id === undefined) return <CoursesPage client={client} onNavigate={onNavigate} />;
  const courseId = decodeURIComponent(id);
  if (view === "col-locacio") {
    const query = new URLSearchParams(search);
    return (
      <PlacementEditorPage
        activityId={query.get("activitat") ?? undefined}
        client={client}
        courseId={courseId}
        key={`${courseId}:${query.get("colocacio") ?? ""}`}
        onNavigate={onNavigate}
        placementId={query.get("colocacio") ?? undefined}
      />
    );
  }
  return (
    <CourseDetailPage client={client} courseId={courseId} key={courseId} onNavigate={onNavigate} />
  );
}
