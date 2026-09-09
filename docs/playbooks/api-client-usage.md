# API client usage

The OpenAPI snapshot is the contract. Components consume feature hooks; feature hooks
consume the generated client. Do not call `fetch` from a component or hand-write an API
shape, parameter, error code, event, or notification.

## Client ownership

Create the client at the app boundary and pass or provide the same instance to feature
hooks. Browser builds use same-origin relative URLs so the reverse proxy owns routing
and the refresh cookie remains first-party:

- `AuthClient.apiBaseUrl` defaults to `/api/v1`.
- `AuthClient.identityBaseUrl` defaults to the empty string, so `/oauth2/*`,
  `/.well-known/*`, and `/connect/*` remain relative to the current host.
- `VITE_API_BASE_URL` and `VITE_IDENTITY_BASE_URL` are optional overrides for tests or
  non-browser clients; deployed browser apps leave them unset.

Every request to `/api/*` or an identity route uses `credentials: "include"`.
`AuthClient` routes `/oauth2/*`, `/.well-known/*`, and `/connect/logout` to the identity
base. It routes `/auth/magic-link`, `/auth/handoff`, and every other application path
to the core API base. The current bootstrap shape is:

```ts
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const identityBaseUrl = import.meta.env.VITE_IDENTITY_BASE_URL ?? "";
const source = await refreshBranding(
  createApiClient({ baseUrl: apiBaseUrl, credentials: "include" }),
  window.location.host,
);
const authClient = new AuthClient({
  apiBaseUrl,
  identityBaseUrl,
});
```

In development, all three Vite apps proxy `/api` to `VITE_CORE_URL` (default
`http://localhost:8080`) and `/oauth2`, `/.well-known`, and `/connect` to `VITE_ID_URL`
(default: the core target). These rules mirror the deployed same-site proxy. They are
disabled only for `VITE_MOCK=1`, when the MSW service worker owns those requests.

The auth package keeps the access token in memory. The refresh token exists only in the
server-issued `HttpOnly; Secure; SameSite=Strict` cookie. MSW cannot issue that cookie,
so `VITE_MOCK=1` explicitly enables a mock-only memory store; the `AuthClient` guard
rejects that store unless mock mode is enabled. Do not read, persist, log, or place
tokens in query keys. The generated operation owns serialization and response typing.

## Query hooks

- Put hooks beside the feature, not in JSX. Name reads `use<Resource>` and writes
  `use<Action><Resource>`.
- Wrap the exact generated operation with TanStack Query. Infer data and variables from
  that operation; never repeat its interface locally.
- Query keys are arrays ordered from broad to narrow: tenant/club scope, resource,
  identifier, then a normalized filter object. Include every value that changes the
  response; exclude display-only state and secrets.
- Gate dependent reads with `enabled`. Represent loading, empty, error, and success
  separately. Do not substitute an empty result while a request is pending.
- Select/transform only view data in the hook. Keep the cached server object intact and
  use `useClubFormats()` at render time.
- Use the generated endpoint and parameters exactly as declared. If the operation is
  absent or its type disagrees with the spec, stop that code path and report contract
  drift instead of inventing a request.

Conceptual shape (placeholders must be replaced by generated names, not copied):

```ts
useQuery({
  queryKey: ["<club-scope>", "<resource>", normalizedFilters],
  queryFn: () => api.<generatedOperation>(normalizedFilters),
});
```

## Mutations and idempotent POSTs

- Use `useMutation`; disable the initiating control while pending and make repeated UI
  activation impossible.
- Send an idempotency key only when the OpenAPI operation or API conventions declare
  it. Generate one key for one user intent, retain it for transport retries of the same
  body, and generate a new key after success, cancellation, or a changed body.
- Pass the key through the generated operation's declared option/header. Never add an
  undeclared header or body field. A reuse conflict is mapped through its catalogued
  error code like every other API failure.
- On success, invalidate the smallest authoritative query-key prefix. Redirect only
  after cache work and user feedback required by the spec are complete.

## Optimistic update policy

The default is pessimistic. Bookings, capacity, billing, permissions, membership state,
and other conflict-prone writes wait for the server unless the task/spec explicitly
requires an optimistic interaction.

When optimism is approved: cancel matching queries, snapshot every cache entry to be
changed, apply one deterministic projection, restore all snapshots on error, show the
catalogued translated message, and invalidate on settlement. Never hide a server
correction or treat a client projection as authorization.

## Error mapping

API failures are `ApiError { code, message, details, traceId }`.

- Load the `errors` namespace and display `errors:<code>` only when that key exists.
- Do not show `message`, `details`, or `traceId` as user copy. `details` may drive field
  placement only where the contract documents its structure; `traceId` is diagnostic.
- An unknown code is contract/catalog drift: show the existing generic unavailable
  message and propose the missing code for the catalog and all three locales.
- Keep HTTP status handling structural: authentication/authorization guards decide
  access; catalog codes decide user-facing explanations.

The lazy namespace and translated-code behavior is exercised in real code at
`packages/i18n/src/index.test.ts`:

```ts
await instance.loadNamespaces("errors");
expect(instance.t("errors:INVALID_CREDENTIALS")).toBe(
  "El correu electrònic o la contrasenya són incorrectes.",
);
```

## MSW and tests

Add fixtures and handlers before UI work. `packages/api-client/src/mocks/scenarios.ts`
keeps role/module variants explicit, and `handlers.ts` reads the selected state:

```ts
http.get("*/api/v1/me", () => HttpResponse.json(currentMockScenario().me)),
```

Every endpoint used by the screen needs a handler. Test success, empty data, each
required catalogued failure, retry/idempotency behavior where applicable, invalidation,
rollback if optimistic, role denial, and module absence. Name feature tests with their
`T-xx-nn` IDs, and explicitly fail the feature test if it makes an unexpected request.
