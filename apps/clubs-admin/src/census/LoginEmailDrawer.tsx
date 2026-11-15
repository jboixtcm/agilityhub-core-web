import {
  apiFieldErrors,
  isApiError,
  type ApiClient,
  type components,
} from "@agilityhub/api-client";
import { Badge, Button, Drawer, FormField, Input, Modal } from "@agilityhub/ui";
import { type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { accessRequestError } from "./access-errors";

type MemberLogin = components["schemas"]["MemberLogin"];

/**
 * The suppression mark of a login e-mail (S03 R-03-06b, S11 R-11-08): «rebot» or «queixa» beside
 * the address, so staff see why no sign-in link, recovery or welcome reaches it (AUTH-02).
 */
export function LoginEmailMark({ status }: { status: MemberLogin["emailStatus"] }) {
  const { t } = useTranslation("admin-census");
  if (status !== "BOUNCED" && status !== "COMPLAINED") return null;
  return (
    <Badge tone="danger">
      {status === "BOUNCED"
        ? t("admin-census:member.login.bounced")
        : t("admin-census:member.login.complained")}
    </Badge>
  );
}

/**
 * D10 «Canvia l'adreça d'accés» (S03 R-03-06b, AUTH-02, decision of 13 Nov 2026): the ADMIN types
 * the new address and confirms; `POST /members/{id}/login-email` mails a confirmation link to the
 * new address only, and nothing changes until the member opens it. No notice goes to the old one.
 */
export function LoginEmailDrawer({
  client,
  login,
  memberId,
  onClose,
  onErased,
  onSent,
  open,
}: {
  client: ApiClient;
  login: MemberLogin;
  memberId: string;
  onClose: () => void;
  onErased: () => void;
  onSent: (sentTo: string) => void;
  open: boolean;
}) {
  const { t } = useTranslation(["admin-census", "errors"]);
  const [email, setEmail] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [erased, setErased] = useState(false);

  const close = () => {
    if (pending) return;
    setEmail("");
    setConfirming(false);
    setFieldError(undefined);
    setFailure(undefined);
    setErased(false);
    onClose();
  };

  const review = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (email.trim() === "") {
      setFieldError(t("admin-census:loginEmail.invalid"));
      document.getElementById("login-email-new")?.focus();
      return;
    }
    setFieldError(undefined);
    setFailure(undefined);
    setConfirming(true);
  };

  const send = async () => {
    setPending(true);
    setFailure(undefined);
    try {
      const result = await client.POST("/members/{id}/login-email", {
        body: { email: email.trim() },
        params: { path: { id: memberId } },
      });
      if (result.data === undefined)
        throw new TypeError("Login e-mail response did not contain data");
      setEmail("");
      setConfirming(false);
      onSent(result.data.sentTo);
    } catch (cause) {
      setConfirming(false);
      const emailError = apiFieldErrors(cause).find((item) => item.field === "email");
      if (emailError !== undefined) {
        setFieldError(
          emailError.code === "UNCHANGED"
            ? t("admin-census:loginEmail.unchanged")
            : t("admin-census:loginEmail.invalid"),
        );
        document.getElementById("login-email-new")?.focus();
      } else if (isApiError(cause, "MEMBER_ERASED")) {
        setErased(true);
        onErased();
      } else if (isApiError(cause, "FORBIDDEN")) {
        setFailure(t("admin-census:loginEmail.forbidden"));
      } else {
        setFailure(accessRequestError(cause, t));
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Drawer
      closeLabel={t("admin-census:common.close")}
      onClose={close}
      open={open}
      title={t("admin-census:member.actions.changeLogin")}
    >
      <section className="census-record__fieldset">
        <h3>{t("admin-census:loginEmail.current")}</h3>
        <p>
          {login.email} <LoginEmailMark status={login.emailStatus} />
        </p>
      </section>
      {erased ? (
        <>
          <p role="alert">{t("errors:MEMBER_ERASED")}</p>
          <Button onClick={close} variant="ghost">
            {t("admin-census:common.cancel")}
          </Button>
        </>
      ) : (
        <form className="census-record__form" noValidate onSubmit={review}>
          <FormField
            {...(fieldError === undefined ? {} : { error: fieldError })}
            help={t("admin-census:loginEmail.help")}
            id="login-email-new"
            label={t("admin-census:loginEmail.new")}
          >
            <Input
              autoComplete="off"
              id="login-email-new"
              onChange={(event) => {
                setEmail(event.currentTarget.value);
                setFieldError(undefined);
              }}
              required
              spellCheck={false}
              type="email"
              value={email}
            />
          </FormField>
          {failure === undefined ? null : <p role="alert">{failure}</p>}
          <div className="census-record__dialog-actions">
            <Button onClick={close} type="button" variant="ghost">
              {t("admin-census:common.cancel")}
            </Button>
            <Button type="submit">{t("admin-census:loginEmail.submit")}</Button>
          </div>
        </form>
      )}
      <Modal
        closeLabel={t("admin-census:common.close")}
        onClose={() => {
          if (!pending) setConfirming(false);
        }}
        open={confirming && !erased}
        title={t("admin-census:member.actions.changeLogin")}
      >
        <p>{t("admin-census:loginEmail.change", { current: login.email, next: email.trim() })}</p>
        <p>{t("admin-census:loginEmail.confirmDescription", { next: email.trim() })}</p>
        <div className="census-record__dialog-actions">
          <Button
            disabled={pending}
            onClick={() => {
              setConfirming(false);
            }}
            variant="ghost"
          >
            {t("admin-census:common.cancel")}
          </Button>
          <Button
            loading={pending}
            onClick={() => {
              void send();
            }}
          >
            {t("admin-census:loginEmail.send")}
          </Button>
        </div>
      </Modal>
    </Drawer>
  );
}
