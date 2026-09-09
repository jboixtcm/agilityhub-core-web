import type { ApiClient, components } from "@agilityhub/api-client";
import { Card, Icon, LimitedMarkdown, Skeleton, Tabs, useBranding } from "@agilityhub/ui";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type ClubPage = components["schemas"]["ClubPage"];
type FaqItem = components["schemas"]["CatalogItemsFaqEntry"]["items"][number];

function localized(source: Record<string, string>, locale: string, fallback: string): string {
  return source[locale] ?? source[fallback] ?? Object.values(source)[0] ?? "";
}

function FaqPanel({ items }: { items: FaqItem[] }) {
  const { t } = useTranslation("shell");
  const [open, setOpen] = useState<string>();
  const categories = useMemo(() => {
    const grouped = new Map<string, FaqItem[]>();
    items.forEach((item) => {
      const entries = grouped.get(item.category) ?? [];
      entries.push(item);
      grouped.set(item.category, entries);
    });
    return [...grouped.entries()];
  }, [items]);

  if (items.length === 0) {
    return <p className="info-page__empty">{t("shell:info.noFaq")}</p>;
  }

  return (
    <div className="info-faq">
      {categories.map(([category, entries]) => (
        <section key={category}>
          <h2>{category}</h2>
          <div className="info-faq__items">
            {entries.map((item) => {
              const expanded = open === item.id;
              return (
                <Card className="info-faq__item" key={item.id}>
                  <button
                    aria-controls={`faq-answer-${item.id}`}
                    aria-expanded={expanded}
                    onClick={() => {
                      setOpen(expanded ? undefined : item.id);
                    }}
                    type="button"
                  >
                    <strong>{item.question}</strong>
                    <Icon aria-hidden="true" name="chev" />
                  </button>
                  {expanded ? <p id={`faq-answer-${item.id}`}>{item.answer}</p> : null}
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function ClubPagePanel({ page }: { page: ClubPage }) {
  const branding = useBranding();
  const { i18n, t } = useTranslation("shell");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const title = localized(page.title, locale, branding.defaultLocale);
  const body = localized(page.body, locale, branding.defaultLocale);
  const publishedAt = page.publishedAt;

  return (
    <article className="info-club-page">
      <h2>{title}</h2>
      <LimitedMarkdown>{body}</LimitedMarkdown>
      {publishedAt === null ? null : (
        <p className="info-club-page__updated">
          {t("shell:info.updated", {
            date: new Intl.DateTimeFormat(locale, {
              day: "2-digit",
              month: "2-digit",
              timeZone: branding.timeZone,
              year: "numeric",
            }).format(new Date(publishedAt)),
          })}
        </p>
      )}
    </article>
  );
}

export function InfoPage({ client }: { client: ApiClient }) {
  const branding = useBranding();
  const { i18n, t } = useTranslation("shell");
  const [faq, setFaq] = useState<FaqItem[]>([]);
  const [pages, setPages] = useState<ClubPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState("");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  useEffect(() => {
    let current = true;
    const faqRequest = branding.modules.includes("FAQ")
      ? client.GET("/faq-entries", { params: { query: { includeInactive: false } } })
      : Promise.resolve({ data: { items: [], totalItems: 0 } });
    void Promise.all([
      faqRequest,
      client.GET("/club-pages", { params: { query: { active: true } } }),
    ]).then(
      ([faqResult, pageResult]) => {
        if (!current) return;
        if (faqResult.data === undefined || pageResult.data === undefined) {
          setFailed(true);
        } else {
          setFaq(faqResult.data.items.filter((item) => item.active));
          setPages(pageResult.data.items.filter((page) => page.active));
          setFailed(false);
        }
        setLoading(false);
      },
      () => {
        if (current) {
          setFailed(true);
          setLoading(false);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [branding.modules, client]);

  const tabItems = useMemo(() => {
    const rules = pages.find((page) => page.key === "RULES");
    const otherPages = pages.filter((page) => page.key !== "RULES");
    return [
      ...(branding.modules.includes("FAQ")
        ? [{ content: <FaqPanel items={faq} />, label: t("shell:info.faq"), value: "faq" }]
        : []),
      ...(rules === undefined
        ? []
        : [
            {
              content: <ClubPagePanel page={rules} />,
              label: t("shell:info.rules"),
              value: rules.key,
            },
          ]),
      ...otherPages.map((page) => ({
        content: <ClubPagePanel page={page} />,
        label: localized(page.title, locale, branding.defaultLocale),
        value: page.key,
      })),
    ];
  }, [branding.defaultLocale, branding.modules, faq, locale, pages, t]);

  const selectedValue = tabItems.some((item) => item.value === selected)
    ? selected
    : (tabItems[0]?.value ?? "");

  return (
    <section className="info-page">
      <h1>{t("shell:nav.info")}</h1>
      {loading ? <Skeleton label={t("shell:info.loading")} /> : null}
      {failed ? <p role="alert">{t("shell:info.loadError")}</p> : null}
      {!loading && !failed && tabItems.length === 0 ? (
        <p className="info-page__empty">{t("shell:info.empty")}</p>
      ) : null}
      {!loading && !failed && tabItems.length > 0 ? (
        <Tabs
          items={tabItems}
          label={t("shell:info.tabs")}
          onValueChange={setSelected}
          value={selectedValue}
        />
      ) : null}
    </section>
  );
}
