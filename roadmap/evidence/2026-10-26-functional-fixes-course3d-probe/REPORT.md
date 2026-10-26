# Settled real-WebGL placement probe — 2026-10-26

**2/2 passed**, command exit 0, 944 product/test inputs unchanged. The probe supplements the existing course-ui coverage: the normal unit renderer records geometry with empty FBX models, and the permanent post-nudge browser test asserts only 2D behavior. No product source changed.

For light and dark themes, the evidence-only browser probe opens the existing 1280 px course-ui harness using Chromium/SwiftShader. It observes the real `tire.fbx` and `wall.fbx` responses (both HTTP 200), waits for network idle, document fonts and animation frames, then records the initial scene. It chooses a 1 m step and moves the course east three times. Real WebGL draw calls increase from 332 to 688, with zero context loss, failed model requests or uncaught page errors. These counters establish rendering activity, not visual correctness.

Visual correctness was checked separately by opening these six original images:

- `light-before-canvas.png` and `light-after-three-nudges-canvas.png`.
- `dark-before-canvas.png` and `dark-after-three-nudges-canvas.png`.
- `light-after-three-nudges.png` and `dark-after-three-nudges.png` (whole viewport).

The obstacle models and numbered labels remain visible after the move in both themes. Their positions shift right relative to the fixed A–F ring markers, with new red/yellow warning halos on the right-edge obstacles. The post-edit canvases are not blank. The probe uses viewport captures without changing the viewport to the page's full height. Eight PNGs are retained in total; the two initial viewport images were not separately opened because the initial canvas originals were inspected.

This closes the narrow post-nudge visual-evidence gap for this fixture and renderer. It does not establish every model, placement operation, browser, GPU or hosted environment. The earlier immediate blank screenshot is retained as an inconclusive capture, not a confirmed software defect.

Exact retained wrapper command (shared heavy lock, host Node 22):

```sh
python3 roadmap/evidence/2026-10-24-functional-fixes-root/run-check.py 26-settled-course3d-probe -- bash roadmap/evidence/2026-10-26-functional-fixes-course3d-probe/run.sh
```

The wrapper sets `HEAVY_WAIT_MIN=120` and snapshots inputs only after acquiring the lock. `../2026-10-24-functional-fixes-root/26-settled-course3d-probe.command`, `.log`, `.summary.json` and `-tested-inputs.json` retain execution provenance; `harness-inputs.json` records the evidence-only runner/config/spec identities. `light-readiness.json` and `dark-readiness.json` retain model responses and render counters. The named Docker container was absent after completion (`docker ps -a --filter name=agilityhub-course3d-review-20261026` returned no names); no dedicated networks/volumes were created.

No provider operation, registry publication, push or deployment occurred. Source was mounted read-only and copied to the disposable container for execution.

Last 40 command-log lines:

```text
.../esbuild@0.25.12/node_modules/esbuild postinstall$ node install.js
.../node_modules/unrs-resolver postinstall: Done
.../node_modules/msw postinstall: Done
.../esbuild@0.25.12/node_modules/esbuild postinstall: Done

devDependencies:
+ @commitlint/cli 21.2.2
+ @commitlint/config-conventional 21.2.2
+ @eslint/css 2.0.0
+ @eslint/js 9.39.5
+ @playwright/test 1.63.0
+ @size-limit/file 13.0.3
+ @types/node 24.13.3
+ eslint 9.39.5
+ eslint-import-resolver-typescript 4.4.5
+ eslint-plugin-import 2.32.0
+ eslint-plugin-jsx-a11y 6.10.2
+ eslint-plugin-react 7.37.5
+ eslint-plugin-react-hooks 7.1.1
+ globals 17.12.0
+ husky 9.1.7
+ i18next-parser 9.4.0
+ lint-staged 17.5.0
+ msw 2.15.0
+ prettier 3.9.6
+ size-limit 13.0.3
+ turbo 2.10.12
+ typescript 5.9.3
+ typescript-eslint 8.69.0

. prepare$ node packages/config/scripts/prepare-husky.mjs
. prepare: .git can't be found
. prepare: Done
Done in 6.1s using pnpm v9.15.9
[WebServer] (node:134) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)

Running 2 tests using 1 worker
··
  2 passed (6.2s)
```
