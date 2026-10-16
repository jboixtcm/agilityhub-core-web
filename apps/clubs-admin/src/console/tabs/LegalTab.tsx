import { Button, FormField, Input, Modal, Textarea } from "@agilityhub/ui";
import { type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { LocaleTabs } from "../../catalogs/shared";
import type { ConsoleTabProps } from "../ClubRecordPage";
import {
  fieldErrorMap,
  FormMessage,
  formErrorMessage,
  type PlatformClub,
  SectionCard,
  TextField,
  useRebasedDraft,
  useWriteState,
} from "../shared";

function legalValues(club: PlatformClub) {
  return {
    imageConsentText: { ...(club.legal?.imageConsentText ?? {}) } as Record<string, string>,
    legalTextsVersion: club.legal?.legalTextsVersion ?? "",
    privacyPolicyUrl: club.legal?.privacyPolicyUrl ?? "",
  };
}

/** Today in the club's own zone (`YYYY-MM-DD`): the default name of a new texts version. */
export function clubToday(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(now);
}

/**
 * S17 §2 «Legal»: privacy URL, image-consent text per club language and the legal texts' version.
 * [Publica una versió nova] saves a new `legalTextsVersion`; the re-consent policy is §13-4's
 * assumption (a notice in the app, no blocking).
 */
export function LegalTab({ client, club, onReload, onReplace }: ConsoleTabProps) {
  const { t } = useTranslation(["console", "errors", "common"]);
  const form = useRebasedDraft(legalValues(club), `${club.id}:${String(club.version)}`);
  const write = useWriteState();
  const [locale, setLocale] = useState(club.defaultLocale);
  const [publishing, setPublishing] = useState(false);
  const [newVersion, setNewVersion] = useState("");
  const fields = fieldErrorMap(t, write.error, { prefix: "legal." });
  const { draft } = form;

  const save = async (legalTextsVersion: string) => {
    const legal = {
      imageConsentText: Object.fromEntries(
        club.locales.flatMap((candidate) => {
          const text = (draft.imageConsentText[candidate] ?? "").trim();
          return text === "" ? [] : [[candidate, text]];
        }),
      ),
      // A club without legal texts yet gets its first version named after today (club's zone).
      legalTextsVersion:
        legalTextsVersion.trim() === "" ? clubToday(club.timeZone) : legalTextsVersion.trim(),
      privacyPolicyUrl: draft.privacyPolicyUrl.trim(),
    };
    // `legal` travels whole (PlatformClubLegal): the three fields as the form shows them.
    const updated = await write.run(async () => {
      const result = await client.PATCH("/platform/clubs/{id}", {
        body: { legal, version: club.version },
        params: { path: { id: club.id } },
      });
      if (result.data === undefined) throw new TypeError("Platform club without data");
      return result.data;
    }, onReload);
    if (updated !== undefined) onReplace(updated);
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.changed.length === 0) return;
    void save(draft.legalTextsVersion);
  };

  return (
    <form className="console-form" onSubmit={submit}>
      <fieldset className="console-fieldset" disabled={write.pending}>
        <SectionCard title={t("console:legal.title")}>
          <TextField
            error={fields.privacyPolicyUrl}
            id="console-legal-privacy"
            label={t("console:legal.privacyPolicyUrl")}
            onChange={(value) => {
              form.setField("privacyPolicyUrl", value);
            }}
            required
            type="url"
            value={draft.privacyPolicyUrl}
          />
          <LocaleTabs locale={locale} locales={club.locales} onChange={setLocale} />
          <FormField
            id="console-legal-image"
            label={t("console:legal.imageConsentText", { locale: t(`console:locales.${locale}`) })}
            {...(fields[`imageConsentText.${locale}`] === undefined
              ? {}
              : { error: fields[`imageConsentText.${locale}`] ?? "" })}
          >
            <Textarea
              id="console-legal-image"
              onChange={(event) => {
                form.setField("imageConsentText", {
                  ...draft.imageConsentText,
                  [locale]: event.currentTarget.value,
                });
              }}
              value={draft.imageConsentText[locale] ?? ""}
            />
          </FormField>
        </SectionCard>
        <SectionCard
          description={t("console:legal.versionHelp")}
          title={t("console:legal.versionTitle")}
        >
          <p>
            {draft.legalTextsVersion === ""
              ? t("console:legal.noVersion")
              : t("console:legal.currentVersion", { version: club.legal?.legalTextsVersion ?? "" })}
          </p>
          <Button
            onClick={() => {
              setNewVersion(clubToday(club.timeZone));
              setPublishing(true);
            }}
            variant="secondary"
          >
            {t("console:legal.publish")}
          </Button>
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
          disabled={form.changed.length === 0 || draft.privacyPolicyUrl.trim() === ""}
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
          setPublishing(false);
        }}
        open={publishing}
        title={t("console:legal.publishTitle")}
      >
        <FormField id="console-legal-new-version" label={t("console:legal.newVersion")}>
          <Input
            id="console-legal-new-version"
            onChange={(event) => {
              setNewVersion(event.currentTarget.value);
            }}
            required
            value={newVersion}
          />
        </FormField>
        <p>{t("console:legal.reconsentPolicy")}</p>
        <div className="console-actions">
          <Button
            onClick={() => {
              setPublishing(false);
            }}
            variant="ghost"
          >
            {t("console:common.cancel")}
          </Button>
          <Button
            disabled={
              newVersion.trim() === "" ||
              newVersion.trim() === (club.legal?.legalTextsVersion ?? "") ||
              draft.privacyPolicyUrl.trim() === ""
            }
            onClick={() => {
              setPublishing(false);
              void save(newVersion);
            }}
          >
            {t("console:legal.publishConfirm")}
          </Button>
        </div>
      </Modal>
    </form>
  );
}
