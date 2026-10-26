# Independent N-02 queue review — 26 October 2026

Read-only review of the existing API source and the profile lane's `../2026-10-24-functional-fixes-web/core-e3-r4-observation/` evidence. No application changes, image rebuild, provider calls or deployment.

## Observed cause in E3-r4

At `09:05:39.572Z` validation emitted `MemberValidated`. From `09:05:40.435Z` to `09:05:56.229Z`, it remained `PENDING`, with zero claim attempts and zero processed consumers. The account and membership were ACTIVE. There was no WELCOME token, N-02 notification or activation email. During that interval, total pending outbox records fell from 941 to 82; `NotificationQueued` peaked at 759. The seed had already created 1,084 pending records before the runtime began draining them.

This reproduces a browser-test readiness race: HTTP health allowed the signup test to run while the seed's asynchronous work still occupied the outbox. It does not establish an email-rendering, local mailbox, recipient or host failure. The earlier E3-r3 failure lacked queue observations, so the same cause there remains an inference. The E3-r4 stack was removed after failure; eventual delivery after its queue drained was not observed.

## Source trace

Java paths below are relative to `agilityhub-core-api/src/main/java/com/agilityhub/core/`; `web:` paths are relative to `agilityhub-core-web/`.

- `cli/CommandSchedulingGuard.java:10` disables scheduled work for CLI commands, including `seed:demo`.
- `clubs/census/application/DemoSeedCommand.java:44` completes the census and planning seed transactions before returning. `identity/application/DemoIdentityService.java:35` emits membership events for fictional accounts; planning produces further booking, training and activity events.
- `web:scripts/core-stack/docker-compose.yml:143` starts Core after the seed and activation services succeed. `web:scripts/e2e-core.sh:227` waits for HTTP health, then starts Playwright without waiting for the outbox.
- `shared/persistence/MongoEventPublisher.java:50` creates PENDING entries in the business transaction, with `nextAttemptAt` set to the current clock. These are immediately eligible events, not future business schedules.
- `shared/application/OutboxDispatcher.java:51` processes at most 100 records per fixed-delay invocation. `shared/persistence/OutboxRepository.java:41` orders eligible records by `nextAttemptAt`, then id. Claimed and retrying entries remain PENDING.
- `clubs/messaging/application/engine/NotificationEngine.java:434` inserts child `NotificationQueued` events in the parent consumer transaction. The dispatcher publishes the parent only after its consumer transaction completes. A zero-PENDING barrier therefore includes this cascading seed work.
- `clubs/census/application/CensusConsumers.java:67` derives dog training changes from seeded level changes; the 96 observed `DogFreeTrainingChanged` entries need not come from a separate startup job.
- `platform/application/jobs/SchedulerTick.java:47` runs on minute boundaries; it is not an ApplicationReady startup task.
- N-02 follows `MemberValidated` → `SignupMails` → `SignupLinks` → `MagicLinkService` → `SystemNotificationService` → local mailbox synchronously in the welcome consumer. It was not reached in this failure.

## Recommended permanent test-harness correction

After successful seed/API health and before Playwright starts, poll the local test database with a bounded deadline until all domain events have left PENDING and no FAILED event exists. Count all PENDING records, including leased or backed-off ones: counting only `nextAttemptAt <= now` can falsely report readiness. Fail immediately on FAILED and emit sanitized counts by type/status, attempts and scheduling timestamps. A small consecutive-empty sample requirement covers asynchronous settlement activity without an arbitrary initial sleep. Keep the existing 15-second welcome-mail assertion unchanged.

Do not change application scheduling or suppress seeded domain events to make the test pass. Notification-delivery statuses are distinct from outbox statuses and have their own retry and guard behavior; this targeted barrier concerns the queue directly observed blocking validation. The profile lane owns the permanent harness edit and its regression tests. A fresh observed E3 run must prove startup drainage and successful N-02 activation under the original assertion before this issue is considered closed.
