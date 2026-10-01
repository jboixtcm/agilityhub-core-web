import { ApiError } from "@agilityhub/api-client";
import brandingCanicFixture from "@agilityhub/api-client/mocks/branding-canic";
import { createI18n } from "@agilityhub/i18n";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import { useActivityErrorMessage } from "./activities/shared";
import { useCalendarErrorMessage } from "./planning/calendar-shared";

const keyReused = (reason: string) =>
  new ApiError({
    code: "IDEMPOTENCY_KEY_REUSED",
    details: { reason },
    message: "Idempotency key reused",
    status: 409,
    traceId: "t-409",
  });

async function wrapper() {
  const i18n = await createI18n({
    branding: brandingCanicFixture,
    browserLanguages: ["ca"],
    initialNamespaces: ["admin-activities", "admin-scheduling", "common", "errors"],
    storage: undefined,
  });
  function Providers({ children }: { children: ReactNode }) {
    return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
  }
  return Providers;
}

describe("E7-W05 step 4 (CONVENCIONS_API §7, E80): the writes that keep their key — D4c's cancellation and D7's publication and cancellation — read one shared text while their first request is still running", () => {
  it.each([
    ["D4c", useCalendarErrorMessage],
    ["D7", useActivityErrorMessage],
  ] as const)(
    "%s: IN_PROGRESS reads «L'operació encara està en curs…»; DIFFERENT_REQUEST keeps errors:IDEMPOTENCY_KEY_REUSED",
    async (_screen, useMessage) => {
      const { result } = renderHook(() => useMessage(), { wrapper: await wrapper() });
      expect(result.current(keyReused("IN_PROGRESS"))).toBe(
        "L'operació encara està en curs. Torna-ho a provar d'aquí a un moment.",
      );
      expect(result.current(keyReused("DIFFERENT_REQUEST"))).toBe(
        "La clau d'idempotència ja s'ha utilitzat per a una altra petició.",
      );
    },
  );
});
