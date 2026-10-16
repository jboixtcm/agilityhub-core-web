/**
 * The members' app course screens (S16 §2, WP-16-F′), one lazy chunk: course-core, course-ui's 2D
 * plan and the store reach only whoever opens a viewer, a registration or a build session; the
 * 3D tab is a chunk of its own.
 */
import type { ApiClient } from "@agilityhub/api-client";

import { BuildSessionPage } from "./BuildSessionPage";
import { RegisterSetupPage } from "./RegisterSetupPage";
import { SetupViewerPage } from "./SetupViewerPage";

export type CourseScreen =
  | { kind: "register"; ringId: string }
  | { kind: "ring"; ringId: string }
  | { kind: "session"; sessionId: string }
  | { kind: "setup"; setupId: string };

export default function CoursesRoute({
  client,
  screen,
}: {
  client: ApiClient;
  screen: CourseScreen;
}) {
  switch (screen.kind) {
    case "register":
      return <RegisterSetupPage client={client} key={screen.ringId} ringId={screen.ringId} />;
    case "ring":
      return (
        <SetupViewerPage client={client} key={`ring-${screen.ringId}`} ringId={screen.ringId} />
      );
    case "session":
      return (
        <BuildSessionPage client={client} key={screen.sessionId} sessionId={screen.sessionId} />
      );
    case "setup":
      return <SetupViewerPage client={client} key={screen.setupId} setupId={screen.setupId} />;
  }
}
