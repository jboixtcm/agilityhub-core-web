import { server } from "@agilityhub/api-client/mocks/server";
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";

import { apiClient, renderPage } from "../booking/test-utils";

import { HomeTrainingSummary } from "./HomeTrainingSummary";
import { setupTrainingWorld } from "./test-utils";

setupTrainingWorld();

it("uses the week's server counter, including earlier sessions, and separates dogs", async () => {
  await renderPage(<HomeTrainingSummary client={apiClient()} dogId={null} />);
  const section = await screen.findByRole("region", { name: "Entrenaments aquesta setmana" });
  expect(await within(section).findByText("2 de 3 entrenaments fets o reservats")).toBeVisible();
  expect(await within(section).findByText("0 de 3 entrenaments fets o reservats")).toBeVisible();
  expect(within(section).getByText("Rock")).toBeVisible();
  expect(within(section).getByText("Toby")).toBeVisible();
});

it("shows a shared member allowance once, without summing it for each dog", async () => {
  server.use(
    http.get("*/api/v1/me/training-summary", () =>
      HttpResponse.json({
        eligibleDogs: [
          { id: "member-rock", name: "Rock" },
          { id: "member-toby", name: "Toby" },
        ],
        limitUnit: "MEMBER",
        counter: { used: 2, limit: 3, remaining: 1 },
      }),
    ),
  );
  await renderPage(<HomeTrainingSummary client={apiClient()} dogId={null} />);
  const section = await screen.findByRole("region", { name: "Entrenaments aquesta setmana" });
  expect(await within(section).findByText("Total de l’abonat")).toBeVisible();
  expect(await within(section).findAllByText(/entrenaments fets o reservats/u)).toHaveLength(1);
});
