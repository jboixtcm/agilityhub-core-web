# E3 single-option quote assertion — prepared only

The first final E3 run on 26 October passed one case, failed the public-signup/add-dog case, and left three serial cases unrun. At e3-signup.spec.ts:1120 the add-dog quote contained one eligible start option after the club cutoff. The helper expected one radio, but SignupPage intentionally renders a single option as a plain quote line (INC-11), covered by its existing day-26 unit case. This is a date-dependent harness assumption, not a newly confirmed product defect.

The patch preserves every label, amount, fee and total assertion, requires one fieldset only for multiple choices, requires no radios/fieldset for a single choice, and verifies its unique plain line. It has not been applied or validated yet. Apply only in the coordinated patch window after the active frozen real-Core groups; run formatting, lint and E2E type checking, then a fresh E3-r2 seed. Preserve core-e3 evidence.

## Application update · 26 October

Applied and formatted in the coordinator-authorized patch window. The original E3 failure is retained as the pre-fix evidence. Lint/type checks and fresh E3-r2 remain pending the final common freeze.

Static validation update: `../11-inc99-and-e3-focused-r2.log` passed focused lint and Core harness typing. The fresh E3-r2 browser run is queued; it is not yet claimed as passed.

Browser validation update: E3-r2 passed 5/5 with zero skips and the sole TODAY add-dog option on 26 October, matching the submitted amounts. Source remained unchanged during the run and owned resources were removed.
