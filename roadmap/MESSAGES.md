# Messages — organizer ↔ executor (append-only, newest at the bottom)

Format: see `roadmap/README.md`. Address entries with `@executor`, `@organizer` or `@jordi`. One topic per entry.

## 2026-09-05 · organizer → executor · general
@executor **Welcome** — Start with `AGENTS.md`, then `roadmap/STATUS.md`. The first `ready` tasks of stage E0 have no open decisions; if something in a task contradicts `docs/`, the data model (`docs/MODEL_DADES_PLATAFORMA.md`) wins and you note it in the report. Ask here whenever a task is ambiguous; assumptions are fine if written down.

## 2026-09-06 · executor → jordi · E0-W02
@jordi **Blocked — gallery screenshot access** — The gallery implementation, UI tests, admin test, typecheck and build run, but all three Playwright engines abort at browser startup under the macOS sandbox (Chromium: MachPort rendezvous permission denied; WebKit/Firefox: abort), and Computer Use has no approved browser. Please enable a browser surface or run `PLAYWRIGHT_BROWSERS_PATH=<installed-path> node scripts/capture-ui-gallery.mjs` outside the sandbox. Assumption: the generated 1280 px screenshots will be accepted after visual inspection, then the remaining verification/report steps can continue.
Blocking: yes.
