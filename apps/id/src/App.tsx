import { Card, EmptyState } from "@agilityhub/ui";
import { useTranslation } from "react-i18next";

export function App() {
  const { t } = useTranslation("shell");
  const routes = ["/login", "/magic-link", "/set-password", "/account", "/products"];

  if (window.location.pathname !== "/" && routes.includes(window.location.pathname)) {
    return (
      <main className="id-page">
        <EmptyState
          description={t("shell:placeholder.description")}
          title={t("shell:placeholder.title")}
        />
      </main>
    );
  }

  return (
    <main className="id-page">
      <Card className="id-card">
        <span aria-hidden="true" className="id-mark">
          {t("shell:landing.mark")}
        </span>
        <h1>{t("shell:landing.title")}</h1>
        <p>{t("shell:landing.description")}</p>
      </Card>
    </main>
  );
}
