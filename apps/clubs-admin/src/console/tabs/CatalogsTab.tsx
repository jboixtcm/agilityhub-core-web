import { type components, useSubmissionKeys } from "@agilityhub/api-client";
import { Button, Checkbox, FormField, Select, Skeleton } from "@agilityhub/ui";
import { type SyntheticEvent, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { useCatalogData } from "../../catalogs/shared";
import type { ConsoleTabProps } from "../ClubRecordPage";
import { consoleErrorMessage, FormMessage, LoadError, SectionCard, useWriteState } from "../shared";

type CatalogPart = components["schemas"]["CatalogCloneRequest"]["parts"][number];
type CloneResult = components["schemas"]["CatalogCloneResult"];

export const CATALOG_PARTS = [
  "LEVELS",
  "RINGS",
  "PLANS",
  "FAQ",
  "MESSAGE_TEMPLATES",
] as const satisfies readonly CatalogPart[];

/**
 * S17 §2 «Catàlegs base» (R-17-08): [Clona d'un club plantilla] with the parts to copy, only over
 * the club's empty parts (`409 CATALOG_NOT_EMPTY {part}`); prices need the same currency.
 */
export function CatalogsTab({ client, club, onReload }: ConsoleTabProps) {
  const { t } = useTranslation(["console", "errors", "common"]);
  const load = useCallback(async () => {
    const result = await client.GET("/platform/club-templates");
    if (result.data === undefined) throw new TypeError("Club templates without data");
    return result.data;
  }, [client]);
  const templates = useCatalogData(load, club.id);
  const [templateId, setTemplateId] = useState("");
  const [parts, setParts] = useState<CatalogPart[]>([...CATALOG_PARTS]);
  const [result, setResult] = useState<CloneResult>();
  const write = useWriteState();
  const keys = useSubmissionKeys();
  const options = templates.items.filter((template) => template.id !== club.id);
  const selected = options.find((template) => template.id === templateId) ?? options[0];
  const currencyDiffers =
    selected !== undefined && selected.currency !== club.currency && parts.includes("PLANS");
  const missingLocales =
    selected === undefined
      ? []
      : club.locales.filter((locale) => !selected.locales.includes(locale));

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selected === undefined || parts.length === 0) return;
    setResult(undefined);
    const body = {
      fromClubId: selected.id,
      parts: CATALOG_PARTS.filter((part) => parts.includes(part)),
    };
    const cloned = await write.run(() =>
      // One `Idempotency-Key` per payload: a retry of an unanswered clone is the same request.
      keys.send(JSON.stringify({ club: club.id, ...body }), async (key) => {
        const response = await client.POST("/platform/clubs/{id}/catalog-clone", {
          body,
          params: { header: { "Idempotency-Key": key }, path: { id: club.id } },
        });
        if (response.data === undefined) throw new TypeError("Catalog clone without data");
        return response.data;
      }),
    );
    if (cloned !== undefined) {
      setResult(cloned);
      // The checklist (templates, faq) follows the copied parts.
      await onReload();
    }
  };

  if (templates.error !== undefined)
    return <LoadError error={templates.error} onRetry={templates.reload} />;
  if (templates.loading && templates.items.length === 0)
    return <Skeleton label={t("console:common.loading")} />;

  return (
    <form className="console-form" onSubmit={(event) => void submit(event)}>
      <SectionCard
        description={t("console:catalogs.description")}
        title={t("console:catalogs.title")}
      >
        {options.length === 0 ? (
          <p className="console-muted">{t("console:catalogs.noTemplates")}</p>
        ) : (
          <fieldset className="console-fieldset" disabled={write.pending}>
            <FormField id="console-catalogs-template" label={t("console:catalogs.template")}>
              <Select
                id="console-catalogs-template"
                onChange={(event) => {
                  setTemplateId(event.currentTarget.value);
                }}
                value={selected?.id ?? ""}
              >
                {options.map((template) => (
                  <option key={template.id} value={template.id}>
                    {t("console:catalogs.templateOption", {
                      currency: template.currency,
                      locales: template.locales.join(", "),
                      name: template.name,
                    })}
                  </option>
                ))}
              </Select>
            </FormField>
            <fieldset className="console-checkbox-group">
              <legend>{t("console:catalogs.partsLabel")}</legend>
              {CATALOG_PARTS.map((part) => (
                <label className="console-check" key={part}>
                  <Checkbox
                    checked={parts.includes(part)}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setParts((current) =>
                        CATALOG_PARTS.filter((candidate) =>
                          candidate === part ? checked : current.includes(candidate),
                        ),
                      );
                    }}
                  />
                  {t(`console:catalogs.parts.${part}`)}
                </label>
              ))}
            </fieldset>
            {currencyDiffers ? (
              <p className="console-message console-message--warning" role="note">
                {t("console:catalogs.currencyWarning", {
                  club: club.currency,
                  template: selected.currency,
                })}
              </p>
            ) : null}
            {missingLocales.length > 0 ? (
              <p className="console-message console-message--warning" role="note">
                {t("console:catalogs.localeWarning", {
                  locales: missingLocales
                    .map((locale) => t(`console:locales.${locale}`))
                    .join(", "),
                })}
              </p>
            ) : null}
            <p className="console-muted">{t("console:catalogs.emptyOnly")}</p>
          </fieldset>
        )}
      </SectionCard>
      <FormMessage
        message={write.error === undefined ? undefined : consoleErrorMessage(t, write.error)}
        tone="danger"
      />
      {result === undefined ? null : (
        <div className="console-message console-message--success" role="status">
          <p>
            {t("console:catalogs.copied", {
              summary: Object.entries(result.copied)
                .map(([part, count]) =>
                  t("console:catalogs.copiedPart", {
                    count,
                    part: t(`console:catalogs.parts.${part}`, { defaultValue: part }),
                  }),
                )
                .join(" · "),
            })}
          </p>
          {/* `warnings` are the api's free text (R-17-08's locale fallback): the reader gets
              them in their own language, never the api's wording. */}
          {result.warnings.length === 0 ? null : <p>{t("console:catalogs.localeFallback")}</p>}
        </div>
      )}
      <div className="console-actions">
        <Button
          disabled={selected === undefined || parts.length === 0}
          loading={write.pending}
          loadingLabel={t("console:catalogs.cloning")}
          type="submit"
        >
          {t("console:catalogs.clone")}
        </Button>
      </div>
    </form>
  );
}
