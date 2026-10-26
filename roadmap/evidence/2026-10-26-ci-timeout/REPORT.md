# Hosted CI time budget

Run [40365668876](https://github.com/jboixtcm/agilityhub-core-web/actions/runs/40365668876), head `d4a1e69`, was cancelled by the 30-minute job deadline. GitHub's annotation explicitly says “The job has exceeded the maximum execution time of 30m0s”. It is not an observed application assertion failure.

The 38 lint/typecheck/test/build tasks passed in 10 minutes. Chromium setup took another 9m20s: apt downloaded 25.9 MB in 8m48s at 49.1 kB/s. Only about 9m38s of the job budget remained for browsers. The previous successful run [39763808029](https://github.com/jboixtcm/agilityhub-core-web/actions/runs/39763808029) already took 29m51s overall, including 9m27s browser installation and 12m02s MSW. The size gate was skipped when the current run was cancelled.

The workflow now has a bounded 45-minute job budget and `--log-order=stream` on the MSW Turbo command. Live logs preserve test progress if a later run is interrupted; the cancelled task's grouped logs did not show its intermediate progress. Runner OS, every required gate, the four browser suites, serial scheduling, assertions and retry settings are unchanged.

Validation: YAML parsed; a structural comparison against HEAD found exactly the budget and logging changes. Prettier and `git diff --check` passed. Turbo's dry run accepted the command and retained all four runnable `playwright test` tasks with caching disabled. The first task-inventory assertion included Turbo's synthetic non-runnable package entries; filtering `<NONEXISTENT>` entries corrected that validation without changing the workflow. See `workflow-validation.json` and `ci-run-analysis.json` for commands, timings and retained excerpts.

No local full-suite rerun was necessary for this workflow-only time-budget change. The next published GitHub run must complete MSW, the size gate and artifact upload before this CI incident is considered verified. No commit or push was performed by this agent.
