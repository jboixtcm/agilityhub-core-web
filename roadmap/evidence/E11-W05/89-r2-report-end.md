
#### Files changed (round 2)
- `packages/ui/src/components.tsx`, `components.test.tsx`;
- `apps/clubs-admin/src/catalogs/RingsPage.tsx`, `RingsPage.test.tsx`;
- `packages/auth/src/auth-client.ts`, `auth-client.test.ts`, `testing.ts`; `AGENTS.md` (one sentence);
- `apps/clubs/src/instructor/StudentCardPage.tsx`, `apps/clubs/src/states.test.tsx`;
- `packages/i18n/src/locales/{ca,es,en}/instructor.json` (`card.noNotes`, `card.noObservations`);
- `CHANGELOG.md`; `roadmap/evidence/E11-W05/70…89-*` and the refreshed `50-D16-ring-bookings-1280.png`.

#### Rules and tests implemented (round 2)
R-05-07, R-05-08 and the R-06-11 pattern (#1, #2); R-01-06 under ruling E163 (#3); S10 22 / step 5 (b) (#4). Tests: the five names in the table above.

#### Assumptions (round 2)
1. **#1 scope.** «Any other button it renders without a type» read as the overlays: `Modal` and `Drawer` each render one button (the ×); both are fixed. A grep of `packages/ui/src` found no other typeless `<button>`.
2. **#2 success path.** A late *success* of a dismissed removal still reloads the list (the ring did change on the api); it never closes or alters the dialog shown now.
3. **#3 jsdom stub kept.** The apps' `test/setup.ts` still install `installWebLocks()`: production browsers all have Web Locks, so the stub makes the jsdom tests behave like them. Without the lease there is no settle pause, so removing the stub would also work; I kept the closer-to-production setup.
4. **#4 empty means** `text` `null` or blank **and** no attachments (`InstructorNoteBlock`/`ObservationsBlock`: `text?: string | null`, `attachments[]`).

#### Questions / catalog proposals (round 2)
1. **Literals for Jordi** (new, invented; applied as proposed): `instructor:card.noNotes` «Encara no hi ha cap nota» / «Todavía no hay ninguna nota» / «No notes yet»; `instructor:card.noObservations` «Encara no hi ha cap observació» / «Todavía no hay ninguna observación» / «No observations yet». They follow 22's existing «Encara no hi ha cap tasca» / «Todavía no hay ninguna tarea» / «No tasks yet».
2. **Denied commands** (none blocked the task; each replaced by an allowed equivalent):
   - `cd apps/clubs-admin && pnpm exec vitest run …` → `pnpm --filter clubs-admin exec vitest run …`;
   - `cp packages/ui/src/components.tsx /tmp/… && git show HEAD:… > … && …` (the red run of the Modal test) → `git show HEAD:packages/ui/src/components.tsx > packages/ui/src/components.tsx`, the run, then the fix re-applied by an edit;
   - a `python3 - <<'EOF' … EOF` edit of `RingsPage.tsx` (refused for its `${…}`-like content) → the same edits through the editor;
   - a chain of `sed … | tail -40 | wc -c` over the logs → `87-r2-tails.py`.
