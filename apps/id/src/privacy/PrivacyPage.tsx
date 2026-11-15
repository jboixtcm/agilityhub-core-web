import { formatPlainDate, normalizeLocale } from "@agilityhub/i18n";
import { Card, LimitedMarkdown } from "@agilityhub/ui";
import { useTranslation } from "react-i18next";

import { PageIntro } from "../PageIntro";

import { PRIVACY_POLICY, type PrivacyPolicy } from "./privacy-policy";

/**
 * PRIV-01: the platform's privacy policy (S01 §2, `apps/id` `/privacy`) in the language the page
 * shows, from its versioned content file. Public: the onboarding consent links it.
 */
export default function PrivacyPage({ policy = PRIVACY_POLICY }: { policy?: PrivacyPolicy }) {
  const { i18n, t } = useTranslation("id");
  const locale = normalizeLocale(i18n.resolvedLanguage);
  const description =
    policy.effectiveDate === null
      ? t("id:privacy.version", { version: policy.version })
      : t("id:privacy.versionAndDate", {
          date: formatPlainDate(policy.effectiveDate, locale, "long"),
          version: policy.version,
        });
  return (
    <main className="id-page id-page--narrow">
      <div className="id-page__wide">
        <PageIntro description={description} title={t("id:privacy.title")} />
        <Card className="id-content-card">
          <LimitedMarkdown>{policy.text[locale]}</LimitedMarkdown>
        </Card>
      </div>
    </main>
  );
}
