import { LOCALE_STORAGE_KEY } from "@agilityhub/i18n";
import { useBranding } from "@agilityhub/ui";
import { useContext, useEffect, useRef } from "react";
import { I18nContext } from "react-i18next";

import { useSession } from "./session";

/**
 * CONVENCIONS_I18N §1 (E11-W06 W5): `Account.locale` > `localStorage` > `navigator`. When the
 * session becomes signed in (the restore of an app start, a sign-in on 01, a handoff), its
 * account's language — one the club enables — replaces the device's, and is kept for the next
 * anonymous visit. Once per sign-in: a selector's own change wins afterwards (it writes
 * `PATCH /me`). An impersonated or support session never sets the actor's device language.
 */
export function useAccountLocale(): void {
  const { me, status } = useSession();
  const branding = useBranding();
  // The instance, never a namespace: the hook must not suspend the app it is mounted in.
  const { i18n } = useContext(I18nContext);
  // A session already there when the app mounts did not sign in on this page.
  const signedIn = useRef(status === "signedIn");
  const locale = me?.account.locale;
  const borrowed = me?.impersonation !== undefined || me?.support !== undefined;

  useEffect(() => {
    if (status !== "signedIn") {
      signedIn.current = false;
      return;
    }
    if (signedIn.current) {
      return;
    }
    signedIn.current = true;
    if (
      borrowed ||
      locale === undefined ||
      !branding.locales.includes(locale) ||
      locale === i18n.resolvedLanguage
    ) {
      return;
    }
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // The language still changes for this page.
    }
    void i18n.changeLanguage(locale);
  }, [borrowed, branding.locales, i18n, locale, status]);
}
