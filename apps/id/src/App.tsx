import { t } from "@agilityhub/i18n";

export function App() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <h1 className="text-2xl font-semibold">{t("shell:app.id")}</h1>
    </main>
  );
}
