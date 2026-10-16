import type { components } from "@agilityhub/api-client";
import { Button, FormField, Switch, Textarea } from "@agilityhub/ui";
import type { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

import type { ConsoleTabProps } from "../ClubRecordPage";
import {
  fieldErrorMap,
  FormMessage,
  formErrorMessage,
  nullable,
  type PlatformClub,
  SectionCard,
  TextField,
  useRebasedDraft,
  useWriteState,
} from "../shared";

type PlatformClubPatch = components["schemas"]["PlatformClubPatch"];

const ADDRESS_FIELDS = ["street", "postalCode", "city", "region", "country"] as const;

function identityValues(club: PlatformClub) {
  return {
    city: club.address?.city ?? "",
    contactEmail: club.contactEmail ?? "",
    contactPhone: club.contactPhone ?? "",
    country: club.address?.country ?? "",
    displayCity: club.displayCity ?? "",
    legalName: club.legalName ?? "",
    name: club.name,
    notes: club.notes ?? "",
    postalCode: club.address?.postalCode ?? "",
    region: club.address?.region ?? "",
    street: club.address?.street ?? "",
    taxId: club.taxId ?? "",
    template: club.template,
    websiteUrl: club.websiteUrl ?? "",
  };
}

type IdentityValues = ReturnType<typeof identityValues>;
type TextKey = Exclude<keyof IdentityValues, "template">;

/**
 * `PATCH /platform/clubs/{id}` of the changed identity fields only, with the version the form was
 * read at; the address travels whole (its fields are one object), `""` clears a nullable field.
 */
export function identityPatch(
  draft: IdentityValues,
  changed: readonly (keyof IdentityValues)[],
  version: number,
): PlatformClubPatch {
  const body: PlatformClubPatch = { version };
  for (const field of changed) {
    if (field === "name") body.name = draft.name.trim();
    else if (field === "template") body.template = draft.template;
    else if (!(ADDRESS_FIELDS as readonly string[]).includes(field)) {
      body[field as Exclude<TextKey, (typeof ADDRESS_FIELDS)[number] | "name">] = nullable(
        draft[field as TextKey],
      );
    }
  }
  if (changed.some((field) => (ADDRESS_FIELDS as readonly string[]).includes(field))) {
    const address = Object.fromEntries(
      ADDRESS_FIELDS.map((field) => [field, nullable(draft[field])]),
    );
    body.address = Object.values(address).every((value) => value === null) ? null : address;
  }
  return body;
}

/** S17 §2 «Identitat»: name, legal data, contact and the platform's internal notes. */
export function IdentityTab({ client, club, onReload, onReplace }: ConsoleTabProps) {
  const { t } = useTranslation(["console", "errors", "common"]);
  const form = useRebasedDraft(identityValues(club), `${club.id}:${String(club.version)}`);
  const write = useWriteState();
  const fields = fieldErrorMap(t, write.error, {
    aliases: Object.fromEntries(ADDRESS_FIELDS.map((field) => [`address.${field}`, field])),
  });
  const text = (field: TextKey, type: "email" | "tel" | "text" | "url" = "text") => (
    <TextField
      error={fields[field]}
      id={`console-identity-${field}`}
      label={t(`console:identity.fields.${field}`)}
      onChange={(value) => {
        form.setField(field, value);
      }}
      required={field === "name"}
      type={type}
      value={form.draft[field]}
    />
  );

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.changed.length === 0) return;
    const body = identityPatch(form.draft, form.changed, club.version);
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

  return (
    <form className="console-form" onSubmit={(event) => void submit(event)}>
      <fieldset className="console-fieldset" disabled={write.pending}>
        <SectionCard title={t("console:identity.title")}>
          <div className="console-grid">
            {text("name")}
            <FormField
              id="console-identity-slug"
              label={t("console:identity.fields.slug")}
              help={t("console:identity.slugHelp")}
            >
              <output className="console-readonly" id="console-identity-slug">
                {club.slug}
              </output>
            </FormField>
            {text("legalName")}
            {text("taxId")}
            {text("displayCity")}
            {text("websiteUrl", "url")}
            {text("contactEmail", "email")}
            {text("contactPhone", "tel")}
          </div>
        </SectionCard>
        <SectionCard title={t("console:identity.addressTitle")}>
          <div className="console-grid">
            {text("street")}
            {text("postalCode")}
            {text("city")}
            {text("region")}
            {text("country")}
          </div>
        </SectionCard>
        <SectionCard title={t("console:identity.platformTitle")}>
          <FormField
            id="console-identity-notes"
            label={t("console:identity.fields.notes")}
            help={t("console:identity.notesHelp")}
            {...(fields.notes === undefined ? {} : { error: fields.notes })}
          >
            <Textarea
              id="console-identity-notes"
              onChange={(event) => {
                form.setField("notes", event.currentTarget.value);
              }}
              value={form.draft.notes}
            />
          </FormField>
          <div className="catalog-switch-row">
            <span>
              <strong>{t("console:identity.fields.template")}</strong>
              <small>{t("console:identity.templateHelp")}</small>
            </span>
            <Switch
              checked={form.draft.template}
              label={t("console:identity.fields.template")}
              onCheckedChange={(checked) => {
                form.setField("template", checked);
              }}
            />
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
          disabled={form.changed.length === 0}
          loading={write.pending}
          loadingLabel={t("console:common.saving")}
          type="submit"
        >
          {t("console:common.save")}
        </Button>
      </div>
    </form>
  );
}
