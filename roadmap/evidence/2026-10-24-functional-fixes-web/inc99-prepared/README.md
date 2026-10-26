# INC-99 prepared correction

Prepared only; active product/test source has not been modified. The shared scale is returned as EASY/MEDIUM/HARD when no club levels exist. RegisterSetupPage interpolates it directly, while other course views already use agilityhubLevelLabel. Reuse that helper to translate only known shared codes and preserve C–D/custom labels. The draft regression renders the actual app/library selector in ca/es/en with all shared codes, a club label and an absent level. Apply and format after the frozen 91-case real-Core pass, then retain a red run before the product patch and a green focused run. No new product strings or API changes are needed.

## Application update · 26 October

Applied in the coordinator-authorized patch window, with all heavy stages stopped. Source and regression are formatted. No validation claim is made yet; the focused run will start after the final common freeze. INC-99 was confirmed by a raw-code gallery capture and source inspection; the new test was added together with the small product fix, so no pre-fix unit red run is claimed.

Validation update: `../11-inc99-and-e3-focused-r2.log` passed all 35 course tests (three locale regressions), ESLint, clubs/Core typechecks and formatting. The first attempt and fixture-only static corrections are documented in `../REPORT.md`.
