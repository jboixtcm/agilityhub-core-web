# RSCE point and grade progress

User-authorized follow-up on the separate `feature/flow-weekly-imports` branch. The authoritative API snapshot adds per-licence grade provenance, all-history promotion progress and calendar-year championship targets under RSCE's consolidated 2026-07-01 regulation (articles 60–63 and 71).

The member screen shows Agility P / PV / PA and Jumping P / PV / PA separately. G1 shows both G2 promotion routes and the outstanding two-judge condition; G2 shows remaining PA for G3 and standard championship progress; G3 shows its four-PV-per-discipline route. The championship total counts a PA / PV round once. Licences are selectable and never pooled for progress. Current grade uses the registered licence, with a labelled last-result fallback and conflict message. No automatic promotion or official eligibility declaration occurs.

All copy is available in ca/es/en. Additional wording comes from the user-supplied regulation; there is no earlier mockup for these new progress panels. Missing history, judges, prior promotion notices, demotions and exceptional qualification routes are explained with the official source link.

Focused statistics tests: 7 passed. Locale/catalog checks passed. Full workspace checks and complete Docker Playwright are running; mobile and desktop captures will be recorded under roadmap/evidence/flow-weekly. Initial local verification found two forbidden test non-null assertions and one ambiguous text selector; both were corrected without changing application behavior.
