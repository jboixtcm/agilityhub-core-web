import type { components } from "@agilityhub/api-client";
import { isApiError } from "@agilityhub/api-client";
import { Button, Checkbox, FormField, Input, Modal, Select } from "@agilityhub/ui";
import { type SyntheticEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ConsoleTabProps } from "../ClubRecordPage";
import {
  CLUB_LOCALES,
  COUNTRY_PROFILES,
  fieldErrorMap,
  FormMessage,
  formErrorMessage,
  type PlatformClub,
  SectionCard,
  useRebasedDraft,
  useWriteState,
} from "../shared";

type PlatformClubPatch = components["schemas"]["PlatformClubPatch"];

function localizationValues(club: PlatformClub) {
  return {
    countryProfile: club.countryProfile,
    currency: club.currency,
    defaultLocale: club.defaultLocale,
    locales: [...club.locales],
    timeZone: club.timeZone,
  };
}

type LocalizationValues = ReturnType<typeof localizationValues>;

/** The IANA zones the browser knows (for the field's suggestions; the api validates the value). */
function knownTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  return intl.supportedValuesOf?.("timeZone") ?? [];
}

/**
 * S17 §2 «Localització»: languages, default language, time zone, currency and country profile.
 * Every change shows its consequences before it is saved (S17: «canvis amb avís de conseqüències»).
 */
export function LocalizationTab({ client, club, onReload, onReplace }: ConsoleTabProps) {
  const { t } = useTranslation(["console", "errors", "common"]);
  const form = useRebasedDraft<LocalizationValues>(
    localizationValues(club),
    `${club.id}:${String(club.version)}`,
  );
  const write = useWriteState();
  const [confirming, setConfirming] = useState(false);
  const zones = useMemo(() => knownTimeZones(), []);
  const fields = fieldErrorMap(t, write.error);
  if (isApiError(write.error, "TIMEZONE_CHANGE_BLOCKED")) {
    fields.timeZone = t("errors:TIMEZONE_CHANGE_BLOCKED");
  }
  const { draft } = form;
  const defaultMissing = !draft.locales.includes(draft.defaultLocale);
  const removedLocales = club.locales.filter((locale) => !draft.locales.includes(locale));

  const save = async () => {
    setConfirming(false);
    const body: PlatformClubPatch = { version: club.version };
    for (const field of form.changed) {
      if (field === "locales") body.locales = [...draft.locales];
      else if (field === "currency") body.currency = draft.currency.trim().toUpperCase();
      else body[field] = draft[field].trim();
    }
    const updated = await write.run(async () => {
      const result = await client.PATCH("/platform/clubs/{id}", {
        body,
        params: { path: { id: club.id } },
      });
      if (result.data === undefined) throw new TypeError("Platform club without data");
      return result.data;
    }, onReload);
    if (updated !== undefined) onReplace(updated);
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.changed.length === 0 || defaultMissing || draft.locales.length === 0) return;
    setConfirming(true);
  };

  return (
    <form className="console-form" onSubmit={submit}>
      <fieldset className="console-fieldset" disabled={write.pending}>
        <SectionCard
          description={t("console:localization.description")}
          title={t("console:localization.title")}
        >
          <fieldset className="console-checkbox-group">
            <legend>{t("console:localization.fields.locales")}</legend>
            {CLUB_LOCALES.map((locale) => (
              <label className="console-check" key={locale}>
                <Checkbox
                  checked={draft.locales.includes(locale)}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    form.setField(
                      "locales",
                      CLUB_LOCALES.filter((candidate) =>
                        candidate === locale ? checked : draft.locales.includes(candidate),
                      ),
                    );
                  }}
                />
                {t(`console:locales.${locale}`)}
              </label>
            ))}
            {fields.locales === undefined ? null : (
              <p className="ah-form-field__error" role="alert">
                {fields.locales}
              </p>
            )}
          </fieldset>
          <div className="console-grid">
            <FormField
              id="console-localization-default"
              label={t("console:localization.fields.defaultLocale")}
              {...(defaultMissing
                ? { error: t("console:localization.defaultNotListed") }
                : fields.defaultLocale === undefined
                  ? {}
                  : { error: fields.defaultLocale })}
            >
              <Select
                id="console-localization-default"
                onChange={(event) => {
                  form.setField("defaultLocale", event.currentTarget.value);
                }}
                value={draft.defaultLocale}
              >
                {CLUB_LOCALES.map((locale) => (
                  <option disabled={!draft.locales.includes(locale)} key={locale} value={locale}>
                    {t(`console:locales.${locale}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              id="console-localization-zone"
              label={t("console:localization.fields.timeZone")}
              help={t("console:localization.timeZoneHelp")}
              {...(fields.timeZone === undefined ? {} : { error: fields.timeZone })}
            >
              <Input
                id="console-localization-zone"
                list="console-time-zones"
                onChange={(event) => {
                  form.setField("timeZone", event.currentTarget.value);
                }}
                required
                value={draft.timeZone}
              />
              <datalist id="console-time-zones">
                {zones.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            </FormField>
            <FormField
              id="console-localization-currency"
              label={t("console:localization.fields.currency")}
              help={t("console:localization.currencyHelp")}
              {...(fields.currency === undefined ? {} : { error: fields.currency })}
            >
              <Input
                id="console-localization-currency"
                maxLength={3}
                onChange={(event) => {
                  form.setField("currency", event.currentTarget.value.toUpperCase());
                }}
                pattern="[A-Z]{3}"
                required
                value={draft.currency}
              />
            </FormField>
            <FormField
              id="console-localization-country"
              label={t("console:localization.fields.countryProfile")}
              {...(fields.countryProfile === undefined ? {} : { error: fields.countryProfile })}
            >
              <Select
                id="console-localization-country"
                onChange={(event) => {
                  form.setField("countryProfile", event.currentTarget.value);
                }}
                value={draft.countryProfile}
              >
                {COUNTRY_PROFILES.map((profile) => (
                  <option key={profile} value={profile}>
                    {t(`console:countryProfile.${profile}`)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        </SectionCard>
      </fieldset>
      <FormMessage
        message={write.error === undefined ? undefined : formErrorMessage(t, write.error, fields)}
        tone="danger"
      />
      <FormMessage message={write.done ? t("console:common.saved") : undefined} tone="success" />
      <div className="console-actions">
        <Button disabled={form.changed.length === 0} onClick={form.reset} variant="ghost">
          {t("console:common.discard")}
        </Button>
        <Button
          disabled={form.changed.length === 0 || defaultMissing || draft.locales.length === 0}
          loading={write.pending}
          loadingLabel={t("console:common.saving")}
          type="submit"
        >
          {t("console:common.save")}
        </Button>
      </div>
      <Modal
        closeLabel={t("console:common.close")}
        onClose={() => {
          setConfirming(false);
        }}
        open={confirming}
        title={t("console:localization.confirmTitle")}
      >
        <p>{t("console:localization.confirmIntro")}</p>
        <ul className="console-consequences">
          {form.changed.includes("timeZone") ? (
            <li>
              {t("console:localization.consequences.timeZone", {
                from: club.timeZone,
                to: draft.timeZone,
              })}
            </li>
          ) : null}
          {form.changed.includes("currency") ? (
            <li>
              {t("console:localization.consequences.currency", {
                from: club.currency,
                to: draft.currency,
              })}
            </li>
          ) : null}
          {removedLocales.length > 0 ? (
            <li>
              {t("console:localization.consequences.localesRemoved", {
                locales: removedLocales.map((locale) => t(`console:locales.${locale}`)).join(", "),
              })}
            </li>
          ) : null}
          {form.changed.includes("locales") && removedLocales.length === 0 ? (
            <li>{t("console:localization.consequences.localesAdded")}</li>
          ) : null}
          {form.changed.includes("defaultLocale") ? (
            <li>{t("console:localization.consequences.defaultLocale")}</li>
          ) : null}
          {form.changed.includes("countryProfile") ? (
            <li>{t("console:localization.consequences.countryProfile")}</li>
          ) : null}
        </ul>
        <div className="console-actions">
          <Button
            onClick={() => {
              setConfirming(false);
            }}
            variant="ghost"
          >
            {t("console:common.cancel")}
          </Button>
          <Button onClick={() => void save()}>{t("console:localization.confirm")}</Button>
        </div>
      </Modal>
    </form>
  );
}
