import { isApiError, type ApiClient } from "@agilityhub/api-client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { errorDetails } from "./shared";

/** `Price.concept`: the price lines a plan can bill (`enums:invoiceLineOrigin`). */
const PRICE_CONCEPTS = ["MONTHLY_FEE", "MAINTENANCE_FEE", "PACK", "SINGLE_CLASS"] as const;

export function isPriceOverlap(error: unknown): boolean {
  return isApiError(error, "PRICE_OVERLAP");
}

/**
 * S12 §6 (INC-68, E138; E11-W06 W9): `409 PRICE_OVERLAP {planId, concept, priceId,
 * conflictingPriceId}` of the simulation and the run names the plan (from `GET /plans`; its id
 * when the plan is not there) and the concept, with the way to D8 «Modalitats i tarifes».
 */
export function PriceOverlapMessage({
  client,
  error,
  onNavigate,
}: {
  client: ApiClient;
  error: unknown;
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation(["admin-billing", "enums", "errors", "shell"]);
  const details = errorDetails(error);
  const planId = typeof details.planId === "string" ? details.planId : undefined;
  const concept = PRICE_CONCEPTS.find((value) => value === details.concept);
  // The plan's name for this answer's `planId` only: a later answer never names another plan.
  const [plan, setPlan] = useState<{ id: string; name: string }>();

  useEffect(() => {
    if (planId === undefined) return undefined;
    let current = true;
    client.GET("/plans", { params: { query: { includeInactive: true } } }).then(
      (result) => {
        const found = result.data?.items.find((item) => item.id === planId);
        if (current) setPlan({ id: planId, name: found?.name ?? planId });
      },
      () => {
        if (current) setPlan({ id: planId, name: planId });
      },
    );
    return () => {
      current = false;
    };
  }, [client, planId]);

  // Until the plan is read (or without the details), the code's own text.
  if (planId === undefined || concept === undefined || plan?.id !== planId) {
    return <>{t("errors:PRICE_OVERLAP")}</>;
  }
  return (
    <>
      {t("admin-billing:errors.priceOverlap", {
        concept: t(`enums:invoiceLineOrigin.${concept}`),
        plan: plan.name,
      })}{" "}
      <a
        href="/modalitats"
        onClick={(event) => {
          event.preventDefault();
          onNavigate("/modalitats");
        }}
      >
        {t("shell:nav.modalities")}
      </a>
    </>
  );
}
