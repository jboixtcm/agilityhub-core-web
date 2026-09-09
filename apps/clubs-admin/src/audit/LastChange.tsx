import type { components } from "@agilityhub/api-client";
import { useBranding } from "@agilityhub/ui";
import { useTranslation } from "react-i18next";

type LastChangeValue = components["schemas"]["LastChange"];

export function LastChange({
  compact = false,
  entityId,
  entityType,
  value,
}: {
  compact?: boolean;
  entityId?: string;
  entityType: string;
  value: LastChangeValue | undefined;
}) {
  const branding = useBranding();
  const { i18n, t } = useTranslation("admin-audit");
  if (value == null) {
    return null;
  }
  const parameters = new URLSearchParams({ entityType });
  if (entityId !== undefined) {
    parameters.set("entityId", entityId);
  }
  const locale = i18n.resolvedLanguage ?? branding.defaultLocale;
  const action = t(`admin-audit:actions.${value.action}`, { defaultValue: value.action });
  const date = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone: branding.timeZone,
  }).format(new Date(value.at));
  const actor = value.actorName ?? t("admin-audit:lastChange.system");

  return (
    <span className="audit-last-change">
      <span>
        {compact
          ? t("admin-audit:lastChange.compact", { actor, date })
          : t("admin-audit:lastChange.summary", { action, actor, date })}
      </span>{" "}
      <span aria-hidden="true">—</span>{" "}
      <a href={`/auditoria?${parameters.toString()}`}>{t("admin-audit:lastChange.history")}</a>
    </span>
  );
}
