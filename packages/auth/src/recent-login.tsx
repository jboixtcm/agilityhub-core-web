import { isApiError } from "@agilityhub/api-client";
import { Button, FormField, Modal, PasswordInput } from "@agilityhub/ui";
import { type SyntheticEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AuthClient } from "./auth-client";
import "./recent-login.css";

/**
 * AUTH-01 (S01 R-01-18, decision of 13 Nov 2026): «Confirma que ets tu». Mounted once per app, it
 * answers `AuthClient.requestRecentLogin()` when a staff action (an export or its file, a
 * remittance file, a member's bank account, a payment provider) is refused with `403
 * RECENT_LOGIN_REQUIRED`. An account with a password types it again: the action is then sent once
 * more. An account without one gets a sign-in link: it opens it and does the action again there.
 */
export function RecentLoginDialog({ client }: { client: AuthClient }) {
  const answer = useRef<((confirmed: boolean) => void) | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unregister = client.setRecentLoginHandler(
      () =>
        new Promise<boolean>((resolve) => {
          answer.current = resolve;
          setOpen(true);
        }),
    );
    return () => {
      unregister();
      answer.current?.(false);
      answer.current = null;
    };
  }, [client]);

  const settle = useCallback((confirmed: boolean) => {
    setOpen(false);
    answer.current?.(confirmed);
    answer.current = null;
  }, []);

  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <RecentLoginForm client={client} onSettle={settle} />
    </Suspense>
  );
}

function RecentLoginForm({
  client,
  onSettle,
}: {
  client: AuthClient;
  onSettle: (confirmed: boolean) => void;
}) {
  const { t } = useTranslation(["auth", "common", "errors"]);
  const account = client.getMe()?.account;
  const withPassword = account?.hasPassword !== false;
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [linkSent, setLinkSent] = useState(false);

  const close = () => {
    if (!pending) onSettle(false);
  };

  const confirm = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password === "") {
      setError(t("auth:recentLogin.passwordRequired"));
      document.getElementById("recent-login-password")?.focus();
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await client.confirmPassword(password);
      onSettle(true);
    } catch (cause) {
      setPending(false);
      setError(
        isApiError(cause, "INVALID_CREDENTIALS")
          ? t("auth:access.invalidCredentials")
          : isApiError(cause, "LOGIN_LOCKED")
            ? t("errors:LOGIN_LOCKED")
            : isApiError(cause, "RATE_LIMITED")
              ? t("errors:RATE_LIMITED")
              : t("auth:access.genericError"),
      );
    }
  };

  const sendLink = async () => {
    if (account === undefined) return;
    setPending(true);
    setError(undefined);
    try {
      await client.requestMagicLink(account.email, "LOGIN");
      setLinkSent(true);
    } catch (cause) {
      setError(
        isApiError(cause, "RATE_LIMITED")
          ? t("errors:RATE_LIMITED")
          : t("auth:access.genericError"),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      closeLabel={t("auth:recentLogin.close")}
      onClose={close}
      open
      title={t("auth:recentLogin.title")}
    >
      {withPassword ? (
        <form className="recent-login" noValidate onSubmit={(event) => void confirm(event)}>
          <p className="recent-login__description">{t("auth:recentLogin.passwordDescription")}</p>
          <FormField
            {...(error === undefined ? {} : { error })}
            id="recent-login-password"
            label={t("auth:access.passwordLabel")}
          >
            <PasswordInput
              autoComplete="current-password"
              disabled={pending}
              hideLabel={t("common:password.hide")}
              id="recent-login-password"
              onChange={(event) => {
                setPassword(event.currentTarget.value);
                setError(undefined);
              }}
              required
              showLabel={t("common:password.show")}
              value={password}
            />
          </FormField>
          <div className="recent-login__actions">
            <Button disabled={pending} onClick={close} type="button" variant="ghost">
              {t("auth:recentLogin.cancel")}
            </Button>
            <Button loading={pending} type="submit">
              {t("auth:recentLogin.confirm")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="recent-login">
          <p className="recent-login__description">{t("auth:recentLogin.linkDescription")}</p>
          {linkSent ? (
            <p role="status">{t("auth:recentLogin.linkSent", { email: account.email })}</p>
          ) : null}
          {error === undefined ? null : <p role="alert">{error}</p>}
          {linkSent ? null : (
            <div className="recent-login__actions">
              <Button disabled={pending} onClick={close} type="button" variant="ghost">
                {t("auth:recentLogin.cancel")}
              </Button>
              <Button loading={pending} onClick={() => void sendLink()} type="button">
                {t("auth:access.magicLink")}
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
