import { LOCALE_STORAGE_KEY, productLocales } from "@agilityhub/i18n";
import { useBranding } from "@agilityhub/ui";
import { useContext, useEffect, useRef } from "react";
import { I18nContext } from "react-i18next";

import { useSession } from "./session";

/**
 * CONVENCIONS_I18N §1 (E11-W06 W5): `Account.locale` > `localStorage` > `navigator`. When the
 * session becomes signed in (the restore of an app start, a sign-in on 01, a handoff), its
 * account's language — one the club enables — replaces the device's, and is kept for the next
 * anonymous visit. Once per sign-in: a selector's own change wins afterwards (it writes
 * `PATCH /me`). Borrowed sessions temporarily use their account's language, matching the JWT
 * locale used by API catalogs, and restore the actor's language without changing device storage.
 */
export function useAccountLocale(): void {
  const { me, status } = useSession();
  const branding = useBranding();
  // The instance, never a namespace: the hook must not suspend the app it is mounted in.
  const { i18n } = useContext(I18nContext);
  // A session already there when the app mounts did not sign in on this page.
  const signedIn = useRef(status === "signedIn");
  const actorLocale = useRef<string | undefined>(undefined);
  const locale = me?.account.locale;
  const borrowed = me?.impersonation !== undefined || me?.support !== undefined;

  useEffect(() => {
    if (status === "signedIn" && borrowed) {
      actorLocale.current ??= i18n.resolvedLanguage ?? i18n.language;
      signedIn.current = false;
      let active = true;
      // API JWT precedence is independent of the club's preference choices. A borrowed account
      // can come from another club; use any language supported by this product temporarily.
      const targetLocale = productLocales.find((supported) => supported === locale);
      if (targetLocale !== undefined) {
        // A delayed namespace load must not apply the target's language after exit/replacement.
        void i18n.loadLanguages(targetLocale).then(() => {
          if (active) void i18n.changeLanguage(targetLocale);
        });
      }
      return () => {
        active = false;
      };
    }
    const returningFromBorrowed = actorLocale.current !== undefined;
    if (actorLocale.current !== undefined) {
      const previous = actorLocale.current;
      actorLocale.current = undefined;
      void i18n.changeLanguage(previous);
    }
    if (status !== "signedIn") {
      signedIn.current = false;
      return;
    }
    if (signedIn.current) {
      return;
    }
    signedIn.current = true;
    if (
      locale === undefined ||
      !branding.locales.includes(locale) ||
      (!returningFromBorrowed && locale === i18n.resolvedLanguage)
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

  useEffect(
    () => () => {
      if (actorLocale.current !== undefined) {
        const previous = actorLocale.current;
        actorLocale.current = undefined;
        void i18n.changeLanguage(previous);
      }
    },
    [i18n],
  );
}
