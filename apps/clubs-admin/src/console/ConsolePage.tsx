import type { ApiClient } from "@agilityhub/api-client";
import { useEffect } from "react";

import { ClubRecordPage } from "./ClubRecordPage";
import { ClubsListPage } from "./ClubsListPage";
import "./console.css";
import { NewClubWizard } from "./NewClubWizard";
import { type ConsoleNavigate, type ConsoleTab, isConsoleTab } from "./shared";

export type ConsoleRoute =
  | { kind: "list" }
  | { kind: "new" }
  | { id: string; kind: "record"; known: boolean; tab: ConsoleTab };

/** `/consola/clubs[/nou | /:id[/:tab]]` (S17 §2); `/consola` alone is the list. */
export function consoleRoute(pathname: string): ConsoleRoute {
  const [, root, section, id, tab] = pathname.replace(/\/+$/u, "").split("/");
  if (root !== "consola" || section !== "clubs" || id === undefined || id === "")
    return { kind: "list" };
  if (id === "nou") return { kind: "new" };
  const known = isConsoleTab(tab);
  return {
    id: decodeURIComponent(id),
    kind: "record",
    known,
    tab: known ? tab : "identitat",
  };
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
  const shownPath =
    route.kind === "record" && !route.known
      ? `/consola/clubs/${encodeURIComponent(route.id)}/${route.tab}`
      : undefined;
  // A record path without a tab, or with one the record has not (an old link), shows Identitat:
  // the address says so too, so the lit tab, the address and a reload agree (E10-W01 review #3).
  useEffect(() => {
    if (shownPath !== undefined) window.history.replaceState(null, "", `${shownPath}${search}`);
  }, [search, shownPath]);
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
