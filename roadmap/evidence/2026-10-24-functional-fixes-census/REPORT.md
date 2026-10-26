# INC-98: record navigation isolation

Completed locally on 26 October 2026, continuing the retained 24 October audit. No deployment, push, provider operation or API/image change. Historical organizer verifications are unchanged.

## Confirmed defect and correction

The real E2 capture `../2026-10-24-functional-fixes-web/core-e2/D10-consent-7-core-1280.png` shows two notification-preference cards after member 6 → 7 navigation and retains the prior member's booking-block success notice. Two sibling blocks used the same member ID as their React key. More broadly, the page kept its record-local drafts, dialogs, data and feedback when its ID changed; a pending edit response could replace the next member or dog's visible record.

`CensusRecordPage.tsx` now gives each member and dog record a keyed inner component. A new ID unmounts the old record and its children and creates fresh state. Late mutation callbacks retain only the unmounted record's setters, so they cannot replace the current record. The notification and privacy blocks also use distinct scoped keys. Role/module checks, contracts and write authorization are unchanged; no new copy or locale keys.

`CensusRecordPage.test.tsx` adds three regressions: completed booking-block action then member navigation has one correct preference card and no previous feedback; a member save released after the next member is shown does not replace it or retain the old drawer; a delayed dog save/open draft cannot cross to another dog's record. Requests for the next member's preferences and consents use the canonical ID returned by the overview, not the route fixture alias. The second member has its own response and a distinct reminder value.

## Attempts retained

- `01-navigation-red` (24 October): 42 existing tests passed, three new cases failed. The duplicate-card and delayed-member failures demonstrate product defects; the dog case initially had an ambiguous Edita selector.
- `02-navigation-red-valid`: the dog selector was scoped to its record header. All three selected regressions failed on unchanged product code; 42 filtered cases were not executed. This proves both delayed member and dog replies could overwrite the next record.
- `03-navigation-green`: 44 passed, one fixture failure. The shared mock exposes notification preferences only for the primary member; the old orphan card had incorrectly satisfied the next member's reminder locator.
- `04-navigation-green` and `05-navigation-inspect`: the fixture correction initially used the route alias, while the overview returns a canonical UUID. The retained full DOM shows the expected read-error card, not a second product defect. The final test derives the canonical ID and installs a separate response for it.
- `06-navigation-green`: all 45 tests passed; lint caught six new-code style/type issues (void callback braces, typed spy result and interface declaration). These were corrected without runtime changes.
- `07-navigation-final`: exit 0; all 45 tests, owned-source ESLint, whole admin TypeScript check and formatting passed. All 944 tested input hashes were unchanged throughout. The duplicate-key warnings are absent from the final log.

## Final command

```sh
bash -c 'corepack pnpm --filter clubs-admin exec vitest run src/census/CensusRecordPage.test.tsx && corepack pnpm exec eslint apps/clubs-admin/src/census/CensusRecordPage.tsx apps/clubs-admin/src/census/CensusRecordPage.test.tsx --max-warnings 0 && corepack pnpm --filter clubs-admin typecheck && corepack pnpm exec prettier --check apps/clubs-admin/src/census/CensusRecordPage.tsx apps/clubs-admin/src/census/CensusRecordPage.test.tsx'
```

Executed through `run-check.py` and the shared `heavy.sh` lock with Node v22.23.2 and `HEAVY_WAIT_MIN=120`. Exact command, complete log, input manifest and machine-readable result are retained.

Last 40 lines (the log is shorter):

```text

 RUN  v5.0.0 /Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs-admin


 Test Files  1 passed (1)
      Tests  45 passed (45)
   Start at  08:20:55
   Duration  5.90s (tests 77%, transform 11%, environment 6%, import 4%, setup 1%)


> clubs-admin@0.0.0 typecheck /Users/jordib/dev/agilityhub/agilityhub-core-web/apps/clubs-admin
> tsc --noEmit

Checking formatting...
All matched files use Prettier code style!
```

Root owns the final complete web gate, full Docker mock suite and fresh-image E2 browser repetition; this focused result does not stand in for those broader runs. Sources are frozen for that coordinated validation.
