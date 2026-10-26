import { type AuthClient, useSession } from "@agilityhub/auth";
import { LOCALE_STORAGE_KEY, productLocales } from "@agilityhub/i18n";
import { Icon, useBranding } from "@agilityhub/ui";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * The header's language selector, inside the user menu (E11-W06 W4: one selector in the back
 * office). CONVENCIONS_I18N §1: the choice is the account's (`PATCH /me`), so the next sign-in
 * keeps it; a support access cannot write it (403).
 */
function LanguageSelector({ authClient }: { authClient: AuthClient }) {
  const branding = useBranding();
  const { me } = useSession();
  const { i18n, t } = useTranslation("shell");
  const borrowed = me?.impersonation !== undefined || me?.support !== undefined;
  const locales = productLocales.filter(
    (locale) => branding.locales.includes(locale) || (borrowed && locale === me.account.locale),
  );

  return (
    <label className="shell-language">
      <span className="ah-sr-only">{t("shell:header.language")}</span>
      <select
        aria-label={t("shell:header.language")}
        disabled={borrowed}
        onChange={(event) => {
          if (borrowed) return;
          const locale = event.currentTarget.value;
          localStorage.setItem(LOCALE_STORAGE_KEY, locale);
          void i18n.changeLanguage(locale);
          if (me !== null && me.account.locale !== locale) {
            void authClient.updateLocale(locale).catch(() => undefined);
          }
        }}
        value={i18n.resolvedLanguage ?? branding.defaultLocale}
      >
        {locales.map((locale) => (
          <option key={locale} value={locale}>
            {locale === "ca"
              ? t("shell:language.ca")
              : locale === "es"
                ? t("shell:language.es")
                : t("shell:language.en")}
          </option>
        ))}
      </select>
    </label>
  );
}

function focusables(panel: HTMLElement | null): HTMLElement[] {
  return panel === null
    ? []
    : Array.from(
        panel.querySelectorAll<HTMLElement>("select:not([disabled]), button:not([disabled])"),
      );
}

/**
 * E11-W06 W4 (AGENTS rule 3, S01 R-01-06): the header's user button opens the account's menu — its
 * name and e-mail, the language and «Tanca la sessió». Focus moves in and stays while it is open;
 * Escape or a click outside closes it, and Escape returns the focus to the button.
 */
export function UserMenu({ authClient }: { authClient: AuthClient }) {
  const { me } = useSession();
  const { t } = useTranslation(["shell", "auth"]);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    focusables(panel.current)[0]?.focus();
    const closeOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && container.current?.contains(event.target) !== true) {
        setOpen(false);
      }
    };
    // Escape closes and gives the focus back to the button; Tab and Shift+Tab stay in the panel.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        toggle.current?.focus();
        return;
      }
      if (event.key !== "Tab" || panel.current?.contains(document.activeElement) !== true) {
        return;
      }
      const items = focusables(panel.current);
      const first = items[0];
      const last = items.at(-1);
      if (first === undefined || last === undefined) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const signOut = () => {
    setPending(true);
    // R-01-06: the api revokes the session and clears its cookie; 01 opens with a full load.
    void authClient
      .logout()
      .catch(() => undefined)
      .finally(() => {
        window.location.assign("/entrar");
      });
  };

  return (
    <div className="admin-user-menu" ref={container}>
      <button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("shell:header.userMenu")}
        onClick={() => {
          setOpen((value) => !value);
        }}
        ref={toggle}
        type="button"
      >
        <Icon aria-hidden="true" name="user" />
      </button>
      {open ? (
        // A non-modal dialog: the account, a language select and the menu of actions.
        <div
          aria-label={t("shell:header.userMenu")}
          className="admin-user-menu__panel"
          id={panelId}
          ref={panel}
          role="dialog"
        >
          {me === null ? null : (
            <p className="admin-user-menu__account">
              <strong>{me.account.name}</strong>
              <span>{me.account.email}</span>
            </p>
          )}
          <LanguageSelector authClient={authClient} />
          <ul
            aria-label={t("shell:header.userMenu")}
            className="admin-user-menu__items"
            role="menu"
          >
            <li role="none">
              <button
                aria-busy={pending || undefined}
                disabled={pending}
                onClick={signOut}
                role="menuitem"
                type="button"
              >
                {t("auth:profile.logout")}
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
