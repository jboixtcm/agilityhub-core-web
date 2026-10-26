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

## Preparing the isolated hosted demo

The functional stack in `scripts/core-stack/docker-compose.yml` is disposable local QA. Its `local` API profile enables test-only clock/DNS helpers and fake or local providers. Do not publish that stack as the hosted demo. The API repository's `deploy/compose.prod.yaml` and `docs/DEPLOY.md` describe the release topology; its preflight requires `prod`, reviewed registry artifacts, private configuration and the production storage/provider settings. A local image ID is not a reviewed registry digest.

Before deploying, choose and configure the new server's architecture, hosts/DNS, public TLS, provider/test policy and actual privacy-policy URL/content, replacing the seed legal pages' controller/contact placeholders. The demo seed supplies fictional identity and non-operative manual-payment instructions, but does not itself disable email, SMS, push or charging adapters. Verify the selected provider behavior before opening access; do not use the local profile as a shortcut around production configuration checks.

Build the three SPAs for those actual origins, including the ID navigation values above, and retain their artifact versions/hashes alongside the API release digest. Build and scan the API for the chosen host architecture if it differs from the locally tested arm64 image. Provision the private storage, keys and backup/restore procedure described in the API runbook, then check the hosted login/refresh, tenant branding, deep links and permitted provider flows. These are operational prerequisites; the local regression results do not establish them. Learn remains unlinked in this demo, with its separate integration deferred.
