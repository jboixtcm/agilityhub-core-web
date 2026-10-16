import {
  type ApiClient,
  apiFieldErrors,
  isApiError,
  useSubmissionKeys,
} from "@agilityhub/api-client";
import {
  Button,
  Card,
  Checkbox,
  FormField,
  Input,
  modulePresets,
  RadioGroup,
  Select,
  Switch,
  Textarea,
} from "@agilityhub/ui";
import { type ReactNode, type SyntheticEvent, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { LocaleTabs, useCatalogData } from "../catalogs/shared";

import {
  buildClubDefinition,
  emptyDraft,
  productThemeValues,
  proposeSlug,
  readStoredDraft,
  stepOfField,
  storableDraft,
  toYaml,
  WIZARD_DRAFT_KEY,
  WIZARD_STEPS,
  type WizardDraft,
  type WizardLocale,
  type WizardStep,
} from "./club-definition";
import { productTheme } from "./product-theme";
import {
  CLUB_LOCALES,
  CONSOLE_MODULES,
  consoleErrorMessage,
  type ConsoleNavigate,
  COUNTRY_PROFILES,
  fieldErrorMap,
  FormMessage,
  TextField,
} from "./shared";
import { MODULE_PRESETS } from "./tabs/ModulesTab";
import { COLOR_KEYS, ContrastChecks, contrastFailures, ThemePreview } from "./tabs/ThemeTab";

function browserStorage(): Storage | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

/** The fields a step must have before the next one (the api checks them all again). */
export function stepProblems(step: WizardStep, draft: WizardDraft): string[] {
  if (step === "identity") {
    return [
      ...(draft.identity.name.trim() === "" ? ["name"] : []),
      ...(/^[a-z0-9-]{3,40}$/u.test(draft.identity.slug.trim()) ? [] : ["slug"]),
    ];
  }
  if (step === "localization") {
    const { defaultLocale, locales, timeZone, currency } = draft.localization;
    return [
      ...(locales.length === 0 ? ["locales"] : []),
      ...(locales.includes(defaultLocale) ? [] : ["defaultLocale"]),
      ...(timeZone.trim() === "" ? ["timeZone"] : []),
      ...(/^[A-Z]{3}$/u.test(currency.trim().toUpperCase()) ? [] : ["currency"]),
    ];
  }
  if (step === "theme")
    return contrastFailures(draft.theme.colors).map((failure) => failure.foreground);
  if (step === "admin") {
    return [
      ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(draft.admin.email.trim()) ? [] : ["email"]),
      ...(draft.admin.name.trim() === "" ? ["name"] : []),
    ];
  }
  return [];
}

/**
 * S17 §2 «D19 Assistent "Nou club"» (`/consola/clubs/nou`): eight steps → [CREA EL CLUB] →
 * `POST /platform/clubs` → the record with the onboarding checklist (T-17-12). The draft can be
 * kept on this device, without personal data.
 */
export function NewClubWizard({
  client,
  onNavigate,
}: {
  client: ApiClient;
  onNavigate: ConsoleNavigate;
}) {
  const { t } = useTranslation(["console", "errors", "common"]);
  // The product's own theme, never the host's branding (a club's admin host would leak its theme).
  const fresh = useMemo(() => emptyDraft(productTheme("light")), []);
  const [restored] = useState(() => readStoredDraft(browserStorage(), fresh));
  const [draft, setDraft] = useState<WizardDraft>(() =>
    restored?.theme.source === "product"
      ? // A kept draft takes the product's current preset, never the colours it was saved with.
        { ...restored, theme: productThemeValues(productTheme(restored.theme.mode)) }
      : (restored ?? fresh),
  );
  const [step, setStep] = useState<WizardStep>("identity");
  const [shownProblems, setShownProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | undefined>(
    restored === undefined ? undefined : t("console:wizard.draftRestored"),
  );
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const keys = useSubmissionKeys();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const loadTemplates = useCallback(async () => {
    const result = await client.GET("/platform/club-templates");
    if (result.data === undefined) throw new TypeError("Club templates without data");
    return result.data;
  }, [client]);
  const templates = useCatalogData(loadTemplates, "templates");
  const index = WIZARD_STEPS.indexOf(step);
  const fields = fieldErrorMap(t, error, {
    aliases: { "admins[0].email": "adminEmail", "admins[0].name": "adminName" },
    prefix: "club.",
  });
  if (isApiError(error, "SLUG_TAKEN")) fields.slug = t("errors:SLUG_TAKEN");
  const problem = (field: string, apiField: string = field) =>
    shownProblems.includes(field)
      ? t(`console:wizard.problems.${step}.${field}`)
      : fields[apiField];

  const update = (change: (current: WizardDraft) => WizardDraft) => {
    // Another payload never reuses the key of one the api left unanswered.
    keys.forget("create-club");
    setDraft(change);
  };

  const goTo = (target: WizardStep) => {
    setShownProblems([]);
    setStep(target);
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const next = () => {
    const problems = stepProblems(step, draft);
    if (problems.length > 0) {
      setShownProblems(problems);
      return;
    }
    const following = WIZARD_STEPS[index + 1];
    if (following !== undefined) goTo(following);
  };

  const saveDraft = () => {
    browserStorage()?.setItem(WIZARD_DRAFT_KEY, JSON.stringify(storableDraft(draft)));
    setNotice(t("console:wizard.draftSaved"));
  };

  const discardDraft = () => {
    browserStorage()?.removeItem(WIZARD_DRAFT_KEY);
    keys.forget("create-club");
    setDraft(fresh);
    setNotice(undefined);
    setError(undefined);
    goTo("identity");
  };

  const definition = useMemo(() => buildClubDefinition(draft), [draft]);

  const create = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step !== "review") {
      next();
      return;
    }
    const firstProblem = WIZARD_STEPS.find(
      (candidate) => stepProblems(candidate, draft).length > 0,
    );
    if (firstProblem !== undefined) {
      goTo(firstProblem);
      setShownProblems(stepProblems(firstProblem, draft));
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      // The signature names the action, never the payload (it carries the admin's address): any
      // edit of the draft forgets the key, so only a retry of the same definition reuses it.
      const created = await keys.send("create-club", async (key) => {
        const result = await client.POST("/platform/clubs", {
          body: definition,
          params: { header: { "Idempotency-Key": key } },
        });
        if (result.data === undefined) throw new TypeError("Created club without data");
        return result.data;
      });
      browserStorage()?.removeItem(WIZARD_DRAFT_KEY);
      onNavigate(`/consola/clubs/${encodeURIComponent(created.club.id)}/identitat?creat=1`);
    } catch (cause) {
      setError(cause);
      // The refusal is shown where it can be fixed: the step of its first field, or the
      // module / template step of its code.
      const field = apiFieldErrors(cause)[0]?.field;
      const target =
        field !== undefined
          ? stepOfField(field)
          : isApiError(cause, "SLUG_TAKEN")
            ? "identity"
            : isApiError(cause, "MODULE_DEPENDENCY")
              ? "modules"
              : isApiError(cause, "TEMPLATE_CLUB_NOT_FOUND")
                ? "catalogs"
                : "review";
      if (target !== "review") goTo(target);
    } finally {
      setPending(false);
    }
  };

  const identity = draft.identity;
  const localization = draft.localization;
  const setIdentity = (field: keyof WizardDraft["identity"], value: string) => {
    update((current) => {
      const nextIdentity = { ...current.identity, [field]: value };
      if (field === "name" && !current.identity.slugEdited) nextIdentity.slug = proposeSlug(value);
      if (field === "slug") nextIdentity.slugEdited = true;
      return { ...current, identity: nextIdentity };
    });
  };
  const text = (
    field: Exclude<keyof WizardDraft["identity"], "slugEdited">,
    type: "email" | "tel" | "text" | "url" = "text",
    help?: string,
  ) => (
    <TextField
      error={problem(field)}
      {...(help === undefined ? {} : { help })}
      id={`console-wizard-${field}`}
      label={t(`console:identity.fields.${field}`)}
      onChange={(value) => {
        setIdentity(field, value);
      }}
      required={field === "name" || field === "slug"}
      type={type}
      value={identity[field]}
    />
  );

  const [manualLocale, setManualLocale] = useState<string>(localization.defaultLocale);
  const steps: Record<WizardStep, ReactNode> = {
    identity: (
      <>
        <div className="console-grid">
          {text("name")}
          {text("slug", "text", t("console:wizard.slugHelp"))}
          {text("legalName")}
          {text("taxId")}
          {text("displayCity")}
          {text("websiteUrl", "url")}
          {text("contactEmail", "email")}
          {text("contactPhone", "tel")}
        </div>
        <h3>{t("console:identity.addressTitle")}</h3>
        <div className="console-grid">
          {text("street")}
          {text("postalCode")}
          {text("city")}
          {text("region")}
          {text("country")}
        </div>
      </>
    ),
    localization: (
      <>
        <fieldset className="console-checkbox-group">
          <legend>{t("console:localization.fields.locales")}</legend>
          {CLUB_LOCALES.map((locale) => (
            <label className="console-check" key={locale}>
              <Checkbox
                checked={localization.locales.includes(locale)}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  update((current) => ({
                    ...current,
                    localization: {
                      ...current.localization,
                      locales: CLUB_LOCALES.filter((candidate) =>
                        candidate === locale
                          ? checked
                          : current.localization.locales.includes(candidate),
                      ),
                    },
                  }));
                }}
              />
              {t(`console:locales.${locale}`)}
            </label>
          ))}
          {problem("locales") === undefined ? null : (
            <p className="ah-form-field__error" role="alert">
              {problem("locales")}
            </p>
          )}
        </fieldset>
        <div className="console-grid">
          <FormField
            id="console-wizard-default-locale"
            label={t("console:localization.fields.defaultLocale")}
            {...(problem("defaultLocale") === undefined
              ? {}
              : { error: problem("defaultLocale") ?? "" })}
          >
            <Select
              id="console-wizard-default-locale"
              onChange={(event) => {
                const value = event.currentTarget.value as WizardLocale;
                update((current) => ({
                  ...current,
                  localization: { ...current.localization, defaultLocale: value },
                }));
              }}
              value={localization.defaultLocale}
            >
              {CLUB_LOCALES.map((locale) => (
                <option
                  disabled={!localization.locales.includes(locale)}
                  key={locale}
                  value={locale}
                >
                  {t(`console:locales.${locale}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <TextField
            error={problem("timeZone")}
            help={t("console:localization.timeZoneHelp")}
            id="console-wizard-time-zone"
            label={t("console:localization.fields.timeZone")}
            onChange={(value) => {
              update((current) => ({
                ...current,
                localization: { ...current.localization, timeZone: value },
              }));
            }}
            required
            value={localization.timeZone}
          />
          <TextField
            error={problem("currency")}
            help={t("console:localization.currencyHelp")}
            id="console-wizard-currency"
            label={t("console:localization.fields.currency")}
            onChange={(value) => {
              update((current) => ({
                ...current,
                localization: { ...current.localization, currency: value.toUpperCase() },
              }));
            }}
            required
            value={localization.currency}
          />
          <FormField
            id="console-wizard-country"
            label={t("console:localization.fields.countryProfile")}
          >
            <Select
              id="console-wizard-country"
              onChange={(event) => {
                const value = event.currentTarget.value === "GENERIC" ? "GENERIC" : "ES";
                update((current) => ({
                  ...current,
                  localization: { ...current.localization, countryProfile: value },
                }));
              }}
              value={localization.countryProfile}
            >
              {COUNTRY_PROFILES.map((profile) => (
                <option key={profile} value={profile}>
                  {t(`console:countryProfile.${profile}`)}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </>
    ),
    modules: (
      <>
        <RadioGroup
          label={t("console:modulesTab.presets")}
          onValueChange={(value) => {
            const preset = MODULE_PRESETS.find((candidate) => candidate === value) ?? "COMPLET";
            update((current) => ({ ...current, modules: { preset } }));
          }}
          options={MODULE_PRESETS.map((preset) => ({
            label: t(`console:presets.${preset}`),
            value: preset,
          }))}
          value={draft.modules.preset}
        />
        <p className="console-muted">{t(`console:wizard.presetHelp.${draft.modules.preset}`)}</p>
        <ul
          aria-label={t("console:wizard.presetModules")}
          className="console-chips console-chips--list"
        >
          {CONSOLE_MODULES.filter((module) =>
            (modulePresets[draft.modules.preset] as readonly string[]).includes(module),
          ).map((module) => (
            <li key={module}>{t(`console:modules.${module}.label`)}</li>
          ))}
        </ul>
        {isApiError(error, "MODULE_DEPENDENCY") ? (
          <FormMessage message={consoleErrorMessage(t, error)} tone="danger" />
        ) : null}
      </>
    ),
    payments: (
      <>
        <p className="console-muted">{t("console:wizard.paymentsLater")}</p>
        <Card className="console-card console-card--nested">
          <div className="catalog-switch-row">
            <strong>{t("console:payments.sepa.title")}</strong>
            <Switch
              checked={draft.payments.sepa.enabled}
              label={t("console:wizard.enableProvider", { name: t("console:payments.sepa.title") })}
              onCheckedChange={(enabled) => {
                update((current) => ({
                  ...current,
                  payments: { ...current.payments, sepa: { ...current.payments.sepa, enabled } },
                }));
              }}
            />
          </div>
          {draft.payments.sepa.enabled ? (
            <div className="console-grid">
              {(["creditorName", "creditorId", "suffix", "invoiceSeriesPattern"] as const).map(
                (field) => (
                  <TextField
                    error={fields[`paymentProviders.SEPA_XML.${field}`]}
                    {...(field === "invoiceSeriesPattern"
                      ? { help: t("console:wizard.invoiceSeriesHelp") }
                      : {})}
                    id={`console-wizard-sepa-${field}`}
                    key={field}
                    label={t(`console:payments.sepa.${field}`)}
                    onChange={(value) => {
                      update((current) => ({
                        ...current,
                        payments: {
                          ...current.payments,
                          sepa: { ...current.payments.sepa, [field]: value },
                        },
                      }));
                    }}
                    value={draft.payments.sepa[field]}
                  />
                ),
              )}
              <p className="console-muted">{t("console:wizard.ibanLater")}</p>
            </div>
          ) : null}
        </Card>
        <Card className="console-card console-card--nested">
          <div className="catalog-switch-row">
            <strong>{t("console:payments.stripe.title")}</strong>
            <Switch
              checked={draft.payments.stripe.enabled}
              label={t("console:wizard.enableProvider", {
                name: t("console:payments.stripe.title"),
              })}
              onCheckedChange={(enabled) => {
                update((current) => ({
                  ...current,
                  payments: {
                    ...current.payments,
                    stripe: { ...current.payments.stripe, enabled },
                  },
                }));
              }}
            />
          </div>
          {draft.payments.stripe.enabled ? (
            <div className="console-grid">
              <FormField id="console-wizard-stripe-mode" label={t("console:payments.stripe.mode")}>
                <Select
                  id="console-wizard-stripe-mode"
                  onChange={(event) => {
                    const mode = event.currentTarget.value === "live" ? "live" : "test";
                    update((current) => ({
                      ...current,
                      payments: {
                        ...current.payments,
                        stripe: { ...current.payments.stripe, mode },
                      },
                    }));
                  }}
                  value={draft.payments.stripe.mode}
                >
                  <option value="test">{t("console:payments.stripe.modes.test")}</option>
                  <option value="live">{t("console:payments.stripe.modes.live")}</option>
                </Select>
              </FormField>
              <TextField
                autoComplete="off"
                error={fields["paymentProviders.STRIPE.publishableKey"]}
                id="console-wizard-stripe-publishable"
                label={t("console:payments.stripe.publishableKey")}
                onChange={(value) => {
                  update((current) => ({
                    ...current,
                    payments: {
                      ...current.payments,
                      stripe: { ...current.payments.stripe, publishableKey: value },
                    },
                  }));
                }}
                value={draft.payments.stripe.publishableKey}
              />
              <p className="console-muted">{t("console:wizard.secretsLater")}</p>
            </div>
          ) : null}
        </Card>
        <Card className="console-card console-card--nested">
          <div className="catalog-switch-row">
            <strong>{t("console:payments.manual.title")}</strong>
            <Switch
              checked={draft.payments.manual.enabled}
              label={t("console:wizard.enableProvider", {
                name: t("console:payments.manual.title"),
              })}
              onCheckedChange={(enabled) => {
                update((current) => ({
                  ...current,
                  payments: {
                    ...current.payments,
                    manual: { ...current.payments.manual, enabled },
                  },
                }));
              }}
            />
          </div>
          {draft.payments.manual.enabled ? (
            <>
              {/* R-17-13: one text per language of the club being created. */}
              <LocaleTabs
                locale={manualLocale}
                locales={localization.locales}
                onChange={setManualLocale}
              />
              <FormField
                id="console-wizard-manual"
                label={t("console:payments.manual.instructions", {
                  locale: t(`console:locales.${manualLocale}`),
                })}
              >
                <Textarea
                  id="console-wizard-manual"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    update((current) => ({
                      ...current,
                      payments: {
                        ...current.payments,
                        manual: {
                          ...current.payments.manual,
                          instructions: {
                            ...current.payments.manual.instructions,
                            [manualLocale]: value,
                          },
                        },
                      },
                    }));
                  }}
                  value={draft.payments.manual.instructions[manualLocale as WizardLocale] ?? ""}
                />
              </FormField>
            </>
          ) : null}
        </Card>
      </>
    ),
    theme: (
      <div className="console-theme__layout">
        <div>
          <RadioGroup
            label={t("console:wizard.themeSource")}
            onValueChange={(value) => {
              update((current) => ({
                ...current,
                theme:
                  value === "product"
                    ? productThemeValues(productTheme(current.theme.mode))
                    : { ...current.theme, source: "custom" },
              }));
            }}
            options={[
              { label: t("console:wizard.themeProduct"), value: "product" },
              { label: t("console:wizard.themeCustom"), value: "custom" },
            ]}
            value={draft.theme.source}
          />
          <FormField id="console-wizard-theme-mode" label={t("console:theme.mode")}>
            <Select
              id="console-wizard-theme-mode"
              onChange={(event) => {
                const mode =
                  event.currentTarget.value === "dark"
                    ? "dark"
                    : event.currentTarget.value === "auto"
                      ? "auto"
                      : "light";
                // «Preset AgilityHub» has a light and a dark palette (S17 §5): the mode picks it.
                update((current) => ({
                  ...current,
                  theme:
                    current.theme.source === "product"
                      ? productThemeValues(productTheme(mode))
                      : { ...current.theme, mode },
                }));
              }}
              value={draft.theme.mode}
            >
              {(["auto", "light", "dark"] as const).map((mode) => (
                <option key={mode} value={mode}>
                  {t(`console:theme.modes.${mode}`)}
                </option>
              ))}
            </Select>
          </FormField>
          {draft.theme.source === "custom" ? (
            <div className="console-color-grid">
              {COLOR_KEYS.map((key) => (
                <FormField
                  id={`console-wizard-color-${key}`}
                  key={key}
                  label={t(`console:theme.colors.${key}`)}
                  {...(shownProblems.includes(key)
                    ? { error: t("console:wizard.problems.theme.contrast") }
                    : {})}
                >
                  <Input
                    id={`console-wizard-color-${key}`}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      update((current) => ({
                        ...current,
                        theme: {
                          ...current.theme,
                          colors: { ...current.theme.colors, [key]: value },
                        },
                      }));
                    }}
                    type="color"
                    value={draft.theme.colors[key]}
                  />
                </FormField>
              ))}
            </div>
          ) : null}
          <ContrastChecks colors={draft.theme.colors} />
          <p className="console-muted">{t("console:wizard.logoLater")}</p>
        </div>
        <ThemePreview
          clubName={identity.name.trim() === "" ? t("console:wizard.unnamed") : identity.name}
          logos={{}}
          theme={{ ...draft.theme }}
        />
      </div>
    ),
    catalogs: (
      <>
        <p className="console-muted">{t("console:wizard.catalogsHelp")}</p>
        <FormField
          id="console-wizard-template"
          label={t("console:catalogs.template")}
          {...(isApiError(error, "TEMPLATE_CLUB_NOT_FOUND")
            ? { error: t("errors:TEMPLATE_CLUB_NOT_FOUND") }
            : {})}
        >
          <Select
            id="console-wizard-template"
            onChange={(event) => {
              const templateId = event.currentTarget.value;
              update((current) => ({ ...current, catalogs: { templateId } }));
            }}
            value={draft.catalogs.templateId}
          >
            <option value="">{t("console:wizard.noTemplate")}</option>
            {templates.items.map((template) => (
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
      </>
    ),
    admin: (
      <>
        <p className="console-muted">{t("console:wizard.adminHelp")}</p>
        <div className="console-grid">
          <TextField
            autoComplete="off"
            error={problem("email", "adminEmail")}
            id="console-wizard-admin-email"
            label={t("console:team.email")}
            onChange={(value) => {
              update((current) => ({ ...current, admin: { ...current.admin, email: value } }));
            }}
            required
            type="email"
            value={draft.admin.email}
          />
          <TextField
            autoComplete="off"
            error={problem("name", "adminName")}
            id="console-wizard-admin-name"
            label={t("console:team.name")}
            onChange={(value) => {
              update((current) => ({ ...current, admin: { ...current.admin, name: value } }));
            }}
            required
            value={draft.admin.name}
          />
        </div>
      </>
    ),
    review: (
      <>
        <dl className="console-review">
          <dt>{t("console:identity.fields.name")}</dt>
          <dd>{identity.name}</dd>
          <dt>{t("console:identity.fields.slug")}</dt>
          <dd>{identity.slug}</dd>
          <dt>{t("console:localization.fields.locales")}</dt>
          <dd>{localization.locales.map((locale) => t(`console:locales.${locale}`)).join(", ")}</dd>
          <dt>{t("console:modulesTab.title")}</dt>
          <dd>{t(`console:presets.${draft.modules.preset}`)}</dd>
          <dt>{t("console:team.email")}</dt>
          <dd>{draft.admin.email}</dd>
        </dl>
        <h3>{t("console:wizard.definitionTitle")}</h3>
        <pre aria-label={t("console:wizard.definitionTitle")} className="console-yaml">
          {toYaml(definition)}
        </pre>
      </>
    ),
  };

  return (
    <form
      className="console-page console-wizard"
      noValidate
      onSubmit={(event) => void create(event)}
    >
      <header className="console-page__header">
        <div>
          <h1>{t("console:wizard.title")}</h1>
          <p className="console-muted">{t("console:wizard.description")}</p>
        </div>
        <div className="console-actions">
          <Button onClick={saveDraft} variant="secondary">
            {t("console:wizard.saveDraft")}
          </Button>
          <Button onClick={discardDraft} variant="ghost">
            {t("console:wizard.discardDraft")}
          </Button>
        </div>
      </header>
      {notice === undefined ? null : (
        <p className="console-message console-message--info" role="status">
          {notice}
        </p>
      )}
      <ol aria-label={t("console:wizard.stepsLabel")} className="console-steps">
        {WIZARD_STEPS.map((candidate, position) => (
          <li aria-current={candidate === step ? "step" : undefined} key={candidate}>
            <button
              disabled={position > index || pending}
              onClick={() => {
                goTo(candidate);
              }}
              type="button"
            >
              <span aria-hidden="true">{position + 1}</span>
              {t(`console:wizard.steps.${candidate}`)}
            </button>
          </li>
        ))}
      </ol>
      <Card className="console-card console-wizard__step">
        <h2 ref={headingRef} tabIndex={-1}>
          {t("console:wizard.stepTitle", {
            name: t(`console:wizard.steps.${step}`),
            position: index + 1,
            total: WIZARD_STEPS.length,
          })}
        </h2>
        <fieldset className="console-fieldset" disabled={pending}>
          {steps[step]}
        </fieldset>
      </Card>
      <FormMessage
        message={error === undefined ? undefined : consoleErrorMessage(t, error)}
        tone="danger"
      />
      <div className="console-actions console-wizard__nav">
        <Button
          disabled={index === 0 || pending}
          onClick={() => {
            const previous = WIZARD_STEPS[index - 1];
            if (previous !== undefined) goTo(previous);
          }}
          variant="ghost"
        >
          {t("console:wizard.previous")}
        </Button>
        {step === "review" ? (
          <Button loading={pending} loadingLabel={t("console:wizard.creating")} type="submit">
            {t("console:wizard.create")}
          </Button>
        ) : (
          <Button type="submit">{t("console:wizard.next")}</Button>
        )}
      </div>
    </form>
  );
}
