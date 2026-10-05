import type { ApiClient } from "@agilityhub/api-client";
import { Button, Card } from "@agilityhub/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export const CHECKOUT_RETURN_KEY = "checkout.return.v1";

type State = "idle" | "pending" | "paid" | "expired";

function stateText(state: Exclude<State, "idle">, t: (key: string) => string): string {
  if (state === "pending") return t("billing:checkout.pending");
  if (state === "paid") return t("billing:checkout.paid");
  return t("billing:checkout.expired");
}

/** Shared Stripe return state. The redirect is never treated as proof of payment. */
export function CheckoutReturn({ client, onRetry }: { client: ApiClient; onRetry: () => void }) {
  const { t } = useTranslation("billing");
  const [sessionId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get("checkout") ??
      params.get("checkoutSessionId") ??
      (params.get("cs") === "success" ? sessionStorage.getItem(CHECKOUT_RETURN_KEY) : null)
    );
  });
  const [state, setState] = useState<State>(sessionId === null ? "idle" : "pending");

  useEffect(() => {
    if (sessionId === null) return;
    let active = true;
    let timer: number | undefined;
    const started = Date.now();
    const read = async () => {
      try {
        const response = await client.GET("/checkout-sessions/{id}", {
          params: { path: { id: sessionId } },
        });
        if (!active || response.data === undefined) return;
        if (response.data.status === "PAID") {
          sessionStorage.removeItem(CHECKOUT_RETURN_KEY);
          setState("paid");
          return;
        }
        if (response.data.status === "EXPIRED" || Date.now() - started >= 10_000) {
          setState("expired");
          return;
        }
      } catch {
        if (!active) return;
        if (Date.now() - started >= 10_000) {
          setState("expired");
          return;
        }
      }
      timer = window.setTimeout(() => void read(), 1000);
    };
    void read();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [client, sessionId]);

  if (state === "idle") return null;
  return (
    <Card className={`checkout-return checkout-return--${state}`} role="status">
      <p>{stateText(state, t)}</p>
      {state === "expired" ? (
        <Button onClick={onRetry}>{t("billing:checkout.retry")}</Button>
      ) : null}
    </Card>
  );
}
