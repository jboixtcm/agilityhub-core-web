import type { ApiClient } from "@agilityhub/api-client";
import { Button, Card } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export const CHECKOUT_RETURN_KEY = "checkout.return.v1";

type State = "error" | "expired" | "idle" | "paid" | "pending" | "stalled";

function stateText(state: Exclude<State, "idle">, t: (key: string) => string): string {
  if (state === "pending" || state === "stalled") return t("billing:checkout.pending");
  if (state === "paid") return t("billing:checkout.paid");
  if (state === "error") return t("errors:INTERNAL_ERROR");
  return t("billing:checkout.expired");
}

/** Shared Stripe return state. The redirect is never treated as proof of payment. */
export function CheckoutReturn({
  client,
  onPaid,
  onRetry,
  signupToken,
}: {
  client: ApiClient;
  onPaid?: () => void;
  onRetry: () => void;
  signupToken?: string;
}) {
  const { t } = useTranslation(["billing", "errors"]);
  const [sessionId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get("checkout") ??
      params.get("checkoutSessionId") ??
      (params.get("cs") === "success" ? sessionStorage.getItem(CHECKOUT_RETURN_KEY) : null)
    );
  });
  const [state, setState] = useState<State>(sessionId === null ? "idle" : "pending");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (sessionId === null) return;
    let active = true;
    let timer: number | undefined;
    const started = Date.now();
    const read = async () => {
      try {
        const response = await client.GET("/checkout-sessions/{id}", {
          params: {
            ...(signupToken === undefined
              ? {}
              : { header: { "X-Signup-Token": signupToken } }),
            path: { id: sessionId },
          },
        });
        if (!active) return;
        if (response.data === undefined) {
          setState("error");
          return;
        }
        if (response.data.status === "PAID") {
          sessionStorage.removeItem(CHECKOUT_RETURN_KEY);
          setState("paid");
          onPaid?.();
          return;
        }
        if (response.data.status === "EXPIRED") {
          setState("expired");
          return;
        }
        if (Date.now() - started >= 10_000) {
          setState("stalled");
          return;
        }
      } catch {
        if (!active) return;
        setState("error");
        return;
      }
      timer = window.setTimeout(() => void read(), 1000);
    };
    void read();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [attempt, client, onPaid, sessionId, signupToken]);

  if (state === "idle") return null;
  return (
    <Card className={`checkout-return checkout-return--${state}`} role="status">
      <p>{stateText(state, t)}</p>
      {state === "pending" || state === "stalled" ? (
        <small>{t("billing:checkout.closeHint")}</small>
      ) : null}
      {state === "expired" ? (
        <Button onClick={onRetry}>{t("billing:checkout.retry")}</Button>
      ) : null}
      {state === "error" || state === "stalled" ? (
        <Button
          onClick={() => {
            setState("pending");
            setAttempt((value) => value + 1);
          }}
        >
          {t("billing:checkout.update")}
        </Button>
      ) : null}
    </Card>
  );
}
