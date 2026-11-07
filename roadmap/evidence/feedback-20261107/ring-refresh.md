# Ring capacity refresh regression

The first release CI failed in `TrainingRingCapacities.test.tsx`: after the first save, a quick clear was overwritten when the delayed GET remounted the editor. The UI announced success before refreshing the saved version. This was an application race, not a changed assertion or timeout.

The editor now awaits the refresh, disables its input while pending and announces success after receiving the updated version. The test deliberately holds the post-save GET: it fails on the old success message and passes after the fix, including the next PATCH with version 1 and a null inherited capacity. No timeout was extended.

Validation: targeted Vitest before fix exit 1; after fix exit 0; targeted ESLint exit 0; clubs-admin TypeScript exit 0. Full CI is required for the new commit. Logs are alongside this report.
