import { t } from "@agilityhub/i18n";

import { Gallery } from "./dev/gallery";

export function App() {
  if (import.meta.env.DEV && window.location.pathname === "/_gallery") {
    return <Gallery />;
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <h1 className="text-2xl font-semibold">{t("shell:app.clubsAdmin")}</h1>
    </main>
  );
}
