import type { ApiClient } from "@agilityhub/api-client";

import { ClubRecordPage } from "./ClubRecordPage";
import { ClubsListPage } from "./ClubsListPage";
import "./console.css";
import { NewClubWizard } from "./NewClubWizard";
import { type ConsoleNavigate, isConsoleTab } from "./shared";

export type ConsoleRoute =
  | { kind: "list" }
  | { kind: "new" }
  | { id: string; kind: "record"; tab: ReturnType<typeof recordTab> };

function recordTab(segment: string | undefined) {
  return isConsoleTab(segment) ? segment : "identitat";
}

/** `/consola/clubs[/nou | /:id[/:tab]]` (S17 §2); `/consola` alone is the list. */
export function consoleRoute(pathname: string): ConsoleRoute {
  const [, root, section, id, tab] = pathname.replace(/\/+$/u, "").split("/");
  if (root !== "consola" || section !== "clubs" || id === undefined || id === "")
    return { kind: "list" };
  if (id === "nou") return { kind: "new" };
  return { id: decodeURIComponent(id), kind: "record", tab: recordTab(tab) };
}

/** D19 «Consola de clubs» (WP-17-C), loaded on demand by the app (its own chunk). */
export default function ConsolePage({
  client,
  onNavigate,
  pathname,
  search,
}: {
  client: ApiClient;
  onNavigate: ConsoleNavigate;
  pathname: string;
  search: string;
}) {
  const route = consoleRoute(pathname);
  if (route.kind === "new") return <NewClubWizard client={client} onNavigate={onNavigate} />;
  if (route.kind === "record") {
    return (
      <ClubRecordPage
        client={client}
        created={new URLSearchParams(search).get("creat") === "1"}
        id={route.id}
        key={route.id}
        onNavigate={onNavigate}
        tab={route.tab}
      />
    );
  }
  return <ClubsListPage client={client} onNavigate={onNavigate} />;
}
