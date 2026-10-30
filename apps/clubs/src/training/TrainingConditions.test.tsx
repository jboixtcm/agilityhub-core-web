import { server } from "@agilityhub/api-client/mocks/server";
import { fireEvent, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";

import { apiClient, renderPage, setupBookingWorld } from "../booking/test-utils";

import { TrainingConditions } from "./TrainingConditions";

setupBookingWorld();
it("loads the club's current conditions on demand, retries failures and closes", async () => {
  let requests = 0;
  server.use(
    http.get("*/api/v1/club-pages/training-conditions", () => {
      requests += 1;
      if (requests === 1) return HttpResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 });
      return HttpResponse.json({
        key: "training-conditions",
        body: { ca: "Cal reservar la pista abans d’anar-hi." },
        title: { ca: "Condicions" },
        active: true,
        version: 1,
        publishedAt: null,
        lastChange: { at: "2026-10-28T12:00:00Z", by: null },
      });
    }),
  );
  await renderPage(<TrainingConditions client={apiClient()} />);
  expect(requests).toBe(0);
  fireEvent.click(await screen.findByRole("button", { name: "Veure condicions" }));
  const modal = await screen.findByRole("dialog");
  await within(modal).findByRole("alert");
  fireEvent.click(within(modal).getByRole("button", { name: "Torna-ho a provar" }));
  expect(await within(modal).findByText("Cal reservar la pista abans d’anar-hi.")).toBeVisible();
  const close = within(modal).getAllByRole("button", { name: "Tanca" })[0];
  if (close === undefined) throw new Error("Missing close action");
  fireEvent.click(close);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
