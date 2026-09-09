import { isApiError } from "@agilityhub/api-client";
import { LOCALE_STORAGE_KEY, productLocales, type Locale } from "@agilityhub/i18n";
import {
  Button,
  Card,
  Checkbox,
  FormField,
  Input,
  Modal,
  resolveBrandingLogo,
  Select,
  useBranding,
} from "@agilityhub/ui";
import { type ReactNode, type SyntheticEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { type AuthClient, type OnboardingRequest, type OnboardingState } from "./auth-client";
import { useSession } from "./session";
import "./onboarding.css";

type OnboardingFields = NonNullable<OnboardingRequest["fields"]>;
type OnboardingFieldKey = keyof OnboardingFields;

export interface OnboardingExperienceProps {
  authClient: AuthClient;
  presentation: "modal" | "page";
  children?: ReactNode;
  onAccepted?: () => void;
  onBlockingRequired?: () => void;
}

function isLocale(value: string | null | undefined): value is Locale {
  return productLocales.includes(value as Locale);
}

function isOnboardingFieldKey(value: string): value is OnboardingFieldKey {
  return value === "name" || value === "locale" || value === "phone";
}

function initialFields(state: OnboardingState, accountLocale: Locale): OnboardingFields {
  const values: OnboardingFields = {};
  for (const field of state.fields) {
    if (field.key === "name" && typeof field.value === "string") {
      values.name = field.value;
    } else if (field.key === "phone" && typeof field.value === "string") {
      values.phone = field.value;
    } else if (field.key === "locale") {
      values.locale = isLocale(field.value) ? field.value : accountLocale;
    }
  }
  return values;
}

function nonEmptyFields(fields: OnboardingFields): OnboardingFields | undefined {
  const result: OnboardingFields = {};
  if (fields.name?.trim()) {
    result.name = fields.name.trim();
  }
  if (fields.locale !== undefined) {
    result.locale = fields.locale;
  }
  if (fields.phone?.trim()) {
    result.phone = fields.phone.trim();
  }
  return Object.keys(result).length === 0 ? undefined : result;
}

function OnboardingBrand() {
  const branding = useBranding();
  const logo = resolveBrandingLogo(branding.theme, { placement: "full" });

  return (
    <div className="onboarding-brand">
      {logo.kind === "initial" ? (
        <span aria-hidden="true" className="onboarding-brand__initial">
          {branding.club.name.charAt(0)}
        </span>
      ) : (
        <img alt={logo.kind === "full" ? branding.club.name : ""} src={logo.src} />
      )}
      {logo.showName ? <strong>{branding.club.name}</strong> : null}
    </div>
  );
}

function OnboardingStatus({ error, retry }: { error?: boolean; retry?: () => void }) {
  const { t } = useTranslation("auth");
  return (
    <main className="onboarding-page">
      <Card className="onboarding-card onboarding-card--status">
        <p role={error === true ? "alert" : "status"}>
          {error === true ? t("auth:onboarding.loadError") : t("auth:onboarding.loading")}
        </p>
        {error === true && retry !== undefined ? (
          <Button onClick={retry} type="button" variant="secondary">
            {t("auth:onboarding.retry")}
          </Button>
        ) : null}
      </Card>
    </main>
  );
}

function OnboardingForm({
  accountLocale,
  authClient,
  onAccepted,
  onPostponed,
  presentation,
  state,
}: {
  accountLocale: Locale;
  authClient: AuthClient;
  onAccepted: (state: OnboardingState) => void;
  onPostponed: (state: OnboardingState) => void;
  presentation: "modal" | "page";
  state: OnboardingState;
}) {
  const { i18n, t } = useTranslation(["auth", "errors"]);
  const [fields, setFields] = useState<OnboardingFields>(() => initialFields(state, accountLocale));
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [imageConsent, setImageConsent] = useState(false);
  const [working, setWorking] = useState<"complete" | "postpone" | "skip" | null>(null);
  const [error, setError] = useState<string>();
  const profileCompletion = state.fields.length > 0;
  const canPostponePolicy = !profileCompletion && state.postponeRemaining > 0;
  const requiredConsent = state.requiredConsent ?? null;

  useEffect(() => {
    if (presentation === "modal") {
      document.querySelector<HTMLInputElement>("#onboarding-consent")?.focus();
    }
  }, [presentation]);

  const complete = async (includeFields: boolean) => {
    if (!consentAccepted) {
      setError(t("errors:VALIDATION_ERROR"));
      document.querySelector<HTMLInputElement>("#onboarding-consent")?.focus();
      return;
    }
    if (requiredConsent === null) {
      setError(t("auth:onboarding.loadError"));
      return;
    }
    setError(undefined);
    setWorking(includeFields ? "complete" : "skip");
    try {
      const selectedFields = includeFields ? nonEmptyFields(fields) : undefined;
      const updated = await authClient.completeOnboarding({
        consentAccepted: true,
        consentVersion: requiredConsent.version,
        ...(selectedFields === undefined ? {} : { fields: selectedFields }),
        ...(profileCompletion ? { imageConsent } : {}),
      });
      if (selectedFields?.locale !== undefined) {
        localStorage.setItem(LOCALE_STORAGE_KEY, selectedFields.locale);
        await i18n.changeLanguage(selectedFields.locale);
      }
      onAccepted(updated);
    } catch (submissionError) {
      if (isApiError(submissionError, "CONSENT_VERSION_OUTDATED")) {
        try {
          const refreshed = await authClient.getOnboarding();
          onAccepted(refreshed);
          setConsentAccepted(false);
          setError(t("errors:CONSENT_VERSION_OUTDATED"));
        } catch {
          setError(t("auth:onboarding.loadError"));
        }
      } else if (isApiError(submissionError, "VALIDATION_ERROR")) {
        setError(t("errors:VALIDATION_ERROR"));
      } else if (isApiError(submissionError, "LOCALE_NOT_SUPPORTED")) {
        setError(t("errors:LOCALE_NOT_SUPPORTED"));
      } else {
        setError(t("auth:onboarding.submitError"));
      }
    } finally {
      setWorking(null);
    }
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    void complete(true);
  };

  const postpone = async () => {
    setWorking("postpone");
    setError(undefined);
    try {
      onPostponed(await authClient.postponeOnboarding());
    } catch {
      setError(t("auth:onboarding.submitError"));
    } finally {
      setWorking(null);
    }
  };

  const fieldLabel = (key: OnboardingFieldKey, required: boolean): string => {
    const label =
      key === "name"
        ? t("auth:onboarding.fields.name")
        : key === "locale"
          ? t("auth:onboarding.fields.locale")
          : t("auth:onboarding.fields.phone");
    return required ? t("auth:onboarding.requiredField", { label }) : label;
  };

  const localeLabel = (locale: Locale): string => {
    if (locale === "ca") {
      return t("auth:onboarding.locales.ca");
    }
    return locale === "es" ? t("auth:onboarding.locales.es") : t("auth:onboarding.locales.en");
  };

  return (
    <form className="onboarding-form" noValidate onSubmit={submit}>
      <p className="onboarding-form__description">
        {profileCompletion
          ? t("auth:onboarding.profileDescription")
          : t("auth:onboarding.policyDescription")}
      </p>
      {state.fields
        .filter((field) => isOnboardingFieldKey(field.key))
        .map((field) => {
          const key = field.key as OnboardingFieldKey;
          if (key === "locale") {
            return (
              <FormField id="onboarding-locale" key={key} label={fieldLabel(key, field.required)}>
                <Select
                  id="onboarding-locale"
                  onChange={(event) => {
                    const locale = event.currentTarget.value as Locale;
                    setFields((current) => ({
                      ...current,
                      locale,
                    }));
                  }}
                  required={field.required}
                  value={fields.locale ?? accountLocale}
                >
                  {productLocales.map((locale) => (
                    <option key={locale} value={locale}>
                      {localeLabel(locale)}
                    </option>
                  ))}
                </Select>
              </FormField>
            );
          }
          return (
            <FormField id={`onboarding-${key}`} key={key} label={fieldLabel(key, field.required)}>
              <Input
                autoComplete={key === "name" ? "name" : "tel"}
                id={`onboarding-${key}`}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setFields((current) => ({ ...current, [key]: value }));
                }}
                required={field.required}
                type={key === "phone" ? "tel" : "text"}
                value={fields[key] ?? ""}
              />
            </FormField>
          );
        })}
      {profileCompletion ? (
        <label className="onboarding-form__check">
          <Checkbox
            checked={imageConsent}
            onChange={(event) => {
              setImageConsent(event.currentTarget.checked);
            }}
          />
          <span>{t("auth:onboarding.imageConsent")}</span>
        </label>
      ) : null}
      {requiredConsent === null ? (
        <p className="onboarding-form__error" role="alert">
          {t("auth:onboarding.loadError")}
        </p>
      ) : (
        <div className="onboarding-form__check">
          <Checkbox
            checked={consentAccepted}
            id="onboarding-consent"
            onChange={(event) => {
              setConsentAccepted(event.currentTarget.checked);
            }}
            required
          />
          <label htmlFor="onboarding-consent">
            {t("auth:onboarding.consentLead")}{" "}
            <a href={requiredConsent.url} rel="noreferrer" target="_blank">
              {t("auth:onboarding.privacyPolicy")}
            </a>
          </label>
        </div>
      )}
      {error === undefined ? null : (
        <p className="onboarding-form__error" role="alert">
          {error}
        </p>
      )}
      <div className="onboarding-form__actions">
        {profileCompletion ? (
          <Button
            disabled={working !== null}
            loading={working === "skip"}
            loadingLabel={t("auth:onboarding.saving")}
            onClick={() => void complete(false)}
            type="button"
            variant="secondary"
          >
            {t("auth:onboarding.skipData")}
          </Button>
        ) : canPostponePolicy ? (
          <Button
            disabled={working !== null}
            loading={working === "postpone"}
            loadingLabel={t("auth:onboarding.postponing")}
            onClick={() => void postpone()}
            type="button"
            variant="secondary"
          >
            {t("auth:onboarding.postpone")}
          </Button>
        ) : null}
        <Button
          disabled={working !== null || state.requiredConsent === null}
          loading={working === "complete"}
          loadingLabel={t("auth:onboarding.saving")}
          type="submit"
        >
          {t("auth:onboarding.continue")}
        </Button>
      </div>
    </form>
  );
}

export function OnboardingExperience({
  authClient,
  children = null,
  onAccepted,
  onBlockingRequired,
  presentation,
}: OnboardingExperienceProps) {
  const session = useSession();
  const { t } = useTranslation("auth");
  const [state, setState] = useState<OnboardingState>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const acceptedRef = useRef(onAccepted);
  const blockingRef = useRef(onBlockingRequired);
  const onboardingPending = session.me?.account.onboardingPending === true;

  useEffect(() => {
    acceptedRef.current = onAccepted;
  }, [onAccepted]);

  useEffect(() => {
    blockingRef.current = onBlockingRequired;
  }, [onBlockingRequired]);

  useEffect(() => {
    if (session.status === "signedIn" && presentation === "page" && !onboardingPending) {
      acceptedRef.current?.();
    }
  }, [onboardingPending, presentation, session.status]);

  useEffect(() => {
    if (!onboardingPending) {
      return;
    }
    let active = true;
    void authClient.getOnboarding().then(
      (loaded) => {
        if (!active) {
          return;
        }
        setLoadFailed(false);
        setState(loaded.pending ? loaded : undefined);
        if (!loaded.pending) {
          acceptedRef.current?.();
        }
      },
      () => {
        if (active) {
          setLoadFailed(true);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [authClient, loadAttempt, onboardingPending]);

  useEffect(() => {
    if (
      presentation === "modal" &&
      state?.pending === true &&
      state.postponeRemaining === 0 &&
      onBlockingRequired !== undefined
    ) {
      blockingRef.current?.();
    }
  }, [onBlockingRequired, presentation, state]);

  if (session.status !== "signedIn" || !onboardingPending) {
    return presentation === "modal" ? children : <OnboardingStatus />;
  }
  if (loadFailed) {
    return (
      <OnboardingStatus
        error
        retry={() => {
          setLoadFailed(false);
          setLoadAttempt((attempt) => attempt + 1);
        }}
      />
    );
  }
  if (state === undefined) {
    return <OnboardingStatus />;
  }
  if (!state.pending || dismissed) {
    return presentation === "modal" ? children : <OnboardingStatus />;
  }
  if (
    presentation === "modal" &&
    state.postponeRemaining === 0 &&
    onBlockingRequired !== undefined
  ) {
    return <OnboardingStatus />;
  }

  const sessionLocale = session.me?.account.locale;
  const accountLocale = isLocale(sessionLocale) ? sessionLocale : "ca";
  const form = (
    <OnboardingForm
      accountLocale={accountLocale}
      authClient={authClient}
      onAccepted={(updated) => {
        setState(updated.pending ? updated : undefined);
        if (!updated.pending) {
          acceptedRef.current?.();
        }
      }}
      onPostponed={(updated) => {
        setState(updated);
        setDismissed(updated.postponeRemaining > 0);
      }}
      presentation={presentation}
      state={state}
    />
  );

  if (presentation === "modal") {
    return (
      <>
        {children}
        <Modal
          closeLabel={t("auth:onboarding.close")}
          dismissible={false}
          onClose={() => undefined}
          open
          title={
            state.fields.length > 0 ? t("auth:onboarding.title") : t("auth:onboarding.policyTitle")
          }
        >
          {form}
        </Modal>
      </>
    );
  }

  return (
    <main className="onboarding-page">
      <Card className="onboarding-card">
        <OnboardingBrand />
        <h1>{t("auth:onboarding.title")}</h1>
        {form}
      </Card>
    </main>
  );
}
