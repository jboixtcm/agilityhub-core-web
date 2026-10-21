// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  accessPathFor,
  isReturnPath,
  keepReturnPath,
  rememberReturnPath,
  RETURN_PATH_STORAGE_KEY,
  takeReturnPath,
} from "./return-path";

afterEach(() => {
  localStorage.clear();
});

describe("E11-W06 W1 (S11 R-11-11, S01 §2 01/02): the return path of the sign-in", () => {
  it("accepts only a same-origin app path that is not an access screen", () => {
    expect(isReturnPath("/espera/e1")).toBe(true);
    expect(isReturnPath("/reserves/b1?pagament=ok")).toBe(true);
    expect(isReturnPath("/preinscripcions/s1")).toBe(true);
    for (const path of [
      "//evil.example/espera",
      "/\\evil.example",
      "https://evil.example/espera/e1",
      "espera/e1",
      "/",
      "/entrar",
      "/entrar?next=%2Fespera%2Fe1",
      "/activacio?token=t",
      "/acces",
      "/alta",
      "/alta/pas-2",
      "/benvinguda",
      "/perfil-acces",
      "/apuntat-hi/gos",
      "/suport",
      "",
      null,
      undefined,
    ]) {
      expect(isReturnPath(path)).toBe(false);
    }
  });

  it("01's address carries the path; anything else opens 01 plain", () => {
    expect(accessPathFor("/espera/e1")).toBe("/entrar?next=%2Fespera%2Fe1");
    expect(accessPathFor("/benvinguda")).toBe("/entrar");
    expect(accessPathFor("/")).toBe("/entrar");
  });

  it("is consumed once: the ?next= first, then the kept one, never an expired one", () => {
    rememberReturnPath("/reserves/b1", 1_000);
    expect(takeReturnPath("?next=%2Fespera%2Fe1", 2_000)).toBe("/espera/e1");
    expect(localStorage.getItem(RETURN_PATH_STORAGE_KEY)).toBeNull();
    expect(takeReturnPath("", 2_000)).toBeNull();

    rememberReturnPath("/reserves/b1", 1_000);
    expect(takeReturnPath("?next=%2F%2Fevil.example", 2_000)).toBe("/reserves/b1");

    rememberReturnPath("/reserves/b1", 1_000);
    expect(takeReturnPath("", 1_000 + 15 * 60_000)).toBeNull();
  });

  it("01 opened with ?next= keeps it for the steps that leave its address", () => {
    keepReturnPath("?next=%2Fespera%2Fe1", 1_000);
    expect(takeReturnPath("", 2_000)).toBe("/espera/e1");
    keepReturnPath("?next=%2Fentrar", 1_000);
    expect(localStorage.getItem(RETURN_PATH_STORAGE_KEY)).toBeNull();
  });
});
