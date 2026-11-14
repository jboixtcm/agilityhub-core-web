# Web deployment configuration

The three SPAs are static Vite builds. `VITE_*` values are public build configuration: set them before building the relevant application and rebuild when changing them. They must never contain credentials. The API deployment and club/domain provisioning are separate operations.

`apps/id` supports these product-navigation options:

| Variable | Default when unset or empty | Use |
| --- | --- | --- |
| `VITE_CLUBS_URL` | `https://clubs.agilitydoghub.com` | Destination of the Clubs card on `/products`. The account page links internally to `/products` and therefore uses the same configuration. |
| `VITE_LEARN_ENABLED` | Learn visible | Set exactly `false` to hide the entire Learn card for an isolated Clubs demo. The default retains its existing public Learn link. |
| `VITE_CONSOLE_URL` | `https://clubsadmin.agilitydoghub.com/consola/clubs` | Destination of the console card, still visible only to an account with `AGILITYHUB_ADMIN`. |

Example for the local HTTPS demo harness:

```sh
VITE_CLUBS_URL=https://app.example.test VITE_LEARN_ENABLED=false pnpm --filter id build
```

For a hosted isolated demo, replace the Clubs URL with its actual member-app origin and set the console URL if that product is offered. Configure the club's `LEARN_LINK` module separately: it controls the link inside the club app, not the global ID product cards. These options change navigation only; they do not enable Learn federation, transfer sessions or provision a product.

Before sharing the demo, use the separate safe demo seed, configure its real legal/privacy-policy URL instead of the placeholder, and verify the built cards and club links on the intended hosts. Keep production seed values and production-default navigation unchanged. Local HTTPS tests use a test proxy and certificate; hosted DNS, public TLS and provider configuration require their own later verification.

## Files every production bundle carries

Each application's `vite build` writes these files into its `dist` next to `index.html` (`scripts/bundle-files.mjs`); `node scripts/check-bundle-files.mjs [dist …]` checks them on a built folder, and CI runs it on its three builds.

| File | Content | Used by |
| --- | --- | --- |
| `content-security-policy.txt` | The `Content-Security-Policy` header value of this bundle, one line: `default-src 'self'`, `script-src 'self'` plus the `sha256` hash of every inline script of the built `index.html` (the cached-branding boot script of `clubs` and `clubs-admin`), `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`. | The server (Caddy) sends it with the bundle's static answers, never with the proxied API (CFG-04). |
| `robots.txt` | `User-agent: *` and `Disallow: /`: no robot may crawl any path. | Served as a static file by every host: the product hosts, the identity host and every club alias each serve one of the three bundles (CFG-05). |
| `version.json` | `{"version": "1.0.0", "commit": "<40 hex>"}`: the version of the app's `package.json` (every web workspace shares one version) and the git commit CI built it from (`GITHUB_SHA`); `null` for a build outside CI, whose tree may differ from any commit. | Names the source of a deployed bundle; the service worker does not precache it (REL-02). Both `apps/clubs` and `apps/clubs-admin` compile the same pair in and read the served file (uncached) to offer «Hi ha una versió nova · Recarrega» when the host serves another build (FE-07). |

The policy allows only the host's own origin: the API is proxied under each SPA host and its signed file URLs are relative. Serving files or the API from another origin (an S3 bucket for attachments, for instance) needs that origin added to the policy first.

## Production bundles: built by CI, deployed only from a green run

The bundles that are deployed are the artifact of a green CI run on `main` (REL-03), never a build made elsewhere. After every check of `.github/workflows/ci.yml` has passed on a push to `main`, its «Production bundles» job runs `node scripts/build-release-bundles.mjs` and uploads the result as the run's artifact `web-bundles-<version>-<commit>`, holding `clubs/dist`, `clubs-admin/dist` and `id/dist`. The upload is the job's last step, so a run that has the artifact is a green run. Each `version.json` names that version and commit.

The release builds read only the configuration committed in `release/`:

| Path | Content |
| --- | --- |
| `release/clubs.env`, `release/clubs-admin.env`, `release/id.env` | The `VITE_*` values of that bundle, one `KEY=value` per line (`#` comments; an empty file keeps every default). Public build configuration only (see above); `VITE_MOCK` and any key outside `VITE_*` are refused. |
| `release/member-pwa/` | The member app's reviewed install files (`manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`), present exactly when `release/clubs.env` sets `VITE_MEMBER_PWA_NAME`. |

The script refuses to build while a file is missing, while the environment sets a `VITE_*` value, while an app folder holds a `.env*` file (Vite would read it too) or without CI's `GITHUB_SHA`; it then runs the mock-data check (`scripts/check-production-bundles.mjs`) and the bundle-files check on the three dists.

To deploy: choose the CI run of the reviewed commit, check that it succeeded (`gh run view <run-id> --json conclusion,headSha`), download its artifact (`gh run download <run-id> --name web-bundles-<version>-<commit>`), check that the three `version.json` name that commit, and copy each `dist` to its versioned release directory (`ID_DIST_DIR`, `CLUBS_DIST_DIR`, `ADMIN_DIST_DIR` in the api's runbook). A rollback takes the previous release's directories, never a rebuild.

## Scheduled real-core run

`.github/workflows/real-core.yml` runs the critical real-core suite (`pnpm e2e:core <id> critical`: the five flows of `PLA_FRONTEND.md` §8) from Monday to Saturday, and on demand, against the api image that is deployed, on the disposable local stack of `scripts/e2e-core.sh`; it never calls a deployed host. The image is the repository variable `DEPLOYED_CORE_IMAGE` (`ghcr.io/<owner>/agilityhub-core-api:sha-<commit>`: the tag the api's CI publishes, `sha-` and the first 7 hex of the commit, or up to all 40, optionally pinned with `@sha256:<digest>` as the api's `IMAGE_TAG`; a moving tag such as `main` or `latest`, or another registry, is refused): update it at every api release, with the release record. The workflow pulls it with the run's `GITHUB_TOKEN`, so the api's package must grant this repository read access. Each run keeps its evidence as the artifact `real-core-critical` for 14 days.

## Preparing the isolated hosted demo

The functional stack in `scripts/core-stack/docker-compose.yml` is disposable local QA. Its `local` API profile enables test-only clock/DNS helpers and fake or local providers. Do not publish that stack as the hosted demo. The API repository's `deploy/compose.prod.yaml` and `docs/DEPLOY.md` describe the release topology; its preflight requires `prod`, reviewed registry artifacts, private configuration and the production storage/provider settings. A local image ID is not a reviewed registry digest.

Before deploying, choose and configure the new server's architecture, hosts/DNS, public TLS, provider/test policy and actual privacy-policy URL/content, replacing the seed legal pages' controller/contact placeholders. The demo seed supplies fictional identity and non-operative manual-payment instructions, but does not itself disable email, SMS, push or charging adapters. Verify the selected provider behavior before opening access; do not use the local profile as a shortcut around production configuration checks.

Build the three SPAs for those actual origins, including the ID navigation values above, and retain their artifact versions/hashes alongside the API release digest. Build and scan the API for the chosen host architecture if it differs from the locally tested arm64 image. Provision the private storage, keys and backup/restore procedure described in the API runbook, then check the hosted login/refresh, tenant branding, deep links and permitted provider flows. These are operational prerequisites; the local regression results do not establish them. Learn remains unlinked in this demo, with its separate integration deferred.
