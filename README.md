# Campus Resource Booking

A MERN application for reserving university rooms, laboratories, and equipment. React, TypeScript, Vite, and Tailwind power the client; Express, Mongoose, JWT, and bcrypt power the REST API. All resource, account, and booking data lives in MongoDB.

## Requirements

- Node.js 22.18+ and npm 10+ (Node 24 recommended; audit executed on Node 24.19).
- MongoDB 7+ **running as a replica set**, or MongoDB Atlas. Booking transactions require a replica set; a standalone MongoDB process is insufficient.
- Access to the npm registry to install dependencies. Docker is optional for local MongoDB.

## Run locally

From the repository root:

```powershell
npm ci --cache .npm-cache
if (!(Test-Path server/.env)) { Copy-Item .env.example server/.env }
```

On macOS/Linux, use `cp -n .env.example server/.env`. Edit `server/.env`: set a random JWT secret of at least 32 characters and choose a seed administrator email and password (at least 8 characters, at most 72 UTF-8 bytes). Generate a secret with:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Start the included single-node development replica set, or set `MONGODB_URI` to your Atlas connection string:

```sh
docker compose up -d --wait
npm run seed
npm run dev
```

Open **http://localhost:5173**. The API runs at **http://localhost:5000/api**. Vite proxies `/api` requests to the server. If changing the API port, also update the proxy in `client/vite.config.ts`. The development MongoDB container binds only to loopback and keeps data in a named volume. If port 27017 is already occupied, use Atlas or consistently change mongod's listening port, both sides of the port mapping, the advertised replica-set member address, and the connection string. An existing replica-set volume keeps its original member configuration; changing the healthcheck alone does not reconfigure it. This Compose configuration runs MongoDB only; run Node/Vite on the host so the advertised loopback member is reachable.

The seed command creates six sample resources and your configured admin account. It preserves existing records and passwords, and refuses to promote an existing regular account. Sample records become real MongoDB documents; the client has no mock-data fallback.

To create only the administrator, explicitly run `npm run seed:admin`. Both seed commands require `NODE_ENV=development`, a valid `SEED_ADMIN_EMAIL`, and a unique `SEED_ADMIN_PASSWORD`; the example password is rejected. `SEED_ADMIN_NAME` is optional. Seeding is never called during server startup, public registration, or production deployment. Existing administrator passwords are preserved; existing regular users cannot be elevated by seeding.

For an existing local MongoDB installation, start a separate instance with a dedicated data directory and `--replSet rs0`, then initialize it with `rs.initiate()` in mongosh. Do not change an unrelated database service just to run this application.

## What works

### Product design and navigation

The interface uses a shared light-neutral, navy and indigo design system across authentication, dashboards, the catalog, resource details, booking dialogs, history and admin management. CSS variables in `client/src/tokens.css` define the palette, spacing, radii and shadows; Tailwind exposes the same tokens. Reusable components include the responsive `AppShell`, navigation drawer, buttons, metric cards, notices, empty states and skeleton loaders. Resource types have locally authored SVG illustrations when no image URL is supplied; these are decorative fallbacks, not photos of actual campus rooms. Supplied resource photos remain unchanged. No additional production dependencies or external font/image services were added for the redesign.

| Screen | Route |
| --- | --- |
| Sign in / create account | `/login`, `/register` |
| Personal dashboard | `/dashboard` |
| Resource catalog | `/` |
| Resource detail and booking | `/resources/:id` |
| My Bookings | `/bookings` |
| Admin dashboard | `/admin/dashboard` |
| Admin resource management | `/admin` |
| Admin booking management | `/admin/bookings` |

After sign-in, members default to their dashboard and admins to the admin dashboard; requested authorized deep links are preserved. The catalog remains available without signing in. The mobile menu uses the same actual routes as the desktop sidebar, with focus containment, Escape dismissal, background inertness and a visible sign-out action. The shared shell includes a keyboard skip link. Dialogs cannot be dismissed while a destructive or booking submission is in progress. Loading states use skeletons; unavailable data is shown as an error or `—`, not a fabricated zero.

Dashboard metrics come entirely from real API responses. The personal dashboard uses `/resources` and `/bookings/me` totals and summaries. The admin dashboard uses dedicated `/admin/dashboard` and `/admin/dashboard/utilization` aggregation endpoints, guarded by verified JWT authentication and the current database admin role. Charts use full aggregation results, not the size of a loaded preview page. No user counts, growth rates, attendance figures or utilization percentages are invented. The resource preview is a directory preview, not a recommendation algorithm. Dashboard refresh buttons make real requests, and metric cards link to the corresponding management screen or reservation group. Existing booking rules, transaction behavior and role enforcement are preserved.

## Admin dashboard definitions

The dashboard at `/admin/dashboard` provides KPI cards, a resource distribution chart, the next confirmed reservations, recorded activity, a UTC daily scheduled-hours chart with an accessible data table, and resources ranked by confirmed scheduled hours. Reservations and activity timestamps display in the browser's local timezone. Usage day buckets and window labels explicitly use UTC. Overview and utilization requests fail independently; an unavailable metric is shown as unknown, never zero. The 7/30/90-day selector and refresh controls make real API calls.

| Metric | Exact definition |
| --- | --- |
| Total resources | All non-archived resources (`deletedAt: null`), active and inactive |
| Active resources | Non-archived resources with `isActive: true` |
| Confirmed upcoming reservations | `status=confirmed` and `endTime > asOf`, including sessions in progress |
| Cancelled reservations | All records currently marked cancelled, regardless of reservation dates or archived resources |
| In-progress reservations | Confirmed records with `startTime <= asOf < endTime`; scheduled time, not attendance |
| Distribution by type | Current resource counts, including inactive inventory; archives excluded; unknown legacy types grouped as Other |
| Confirmed scheduled hours | Sum of confirmed intervals clipped to the selected elapsed window `[asOf - days × 24h, asOf)`. Cancelled and future-only time excluded; historical inactive/archived resource bookings retained |
| Reservations represented | Number of confirmed reservations with positive time intersecting that window |
| Distinct resources represented | Number of distinct resource IDs in those intersecting reservations |

`GET /api/admin/dashboard` accepts strict bounded `upcomingLimit` (default 6, maximum 20) and `activityLimit` (default 8, maximum 20). `GET /api/admin/dashboard/utilization` accepts `days=7|30|90` (default 30) and `limit` (default 5, maximum 10 ranked resources). Invalid, repeated, unknown or out-of-range parameters return 400. Both endpoints return `Cache-Control: no-store`. Missing, forged or expired tokens return 401; non-admin accounts return 403, including immediately after database role demotion.

The service captures a server `asOf` for each response to classify temporal boundaries consistently. Its independent overview queries run in parallel; they are **not an atomic cross-collection snapshot**, so writes during a refresh can briefly produce differences between sections. Overview and utilization responses have their own `asOf` timestamps. A refresh reconciles subsequent reads; these are operational insights rather than an accounting ledger.

Recent activity merges four bounded timestamp streams: booking creation, recorded cancellation, resource creation, and archive. It does not infer an edit from `updatedAt` (transaction locks also update resources), invent cancellation times for legacy records without `cancelledAt`, or claim the reservation owner performed a cancellation. This derived feed is not an immutable audit log. Resource opening hours, activation history and attendance are not recorded, so **a utilization percentage has no defensible denominator**; the API returns `utilizationPercent: null` and the interface explains the limitation. Ranked bars compare actual scheduled hours, not occupancy percentages. UTC day buckets split midnight crossings and can have partial first/last days.

MongoDB aggregation performs the counts, grouping, clipping, daily bucketing and ranking. Overview lists and each activity stream are sorted and limited before safe user/resource lookups. User joins explicitly project only ID/name/email, never password hashes. Utilization uses a bounded window and `$facet`; distinct resources are counted without building a large ID array. Aggregations have a 10-second execution limit. All-time exact counts necessarily consider the relevant historical records; there are no precomputed or fabricated totals. Added indexes cover current inventory/type/activity dates and booking status/end/start dates, with partial date indexes for cancellations and archives. Startup awaits model index initialization. Partial date filters use MongoDB's supported [`$type` partial-index expression](https://www.mongodb.com/docs/manual/core/index-partial/). Actual query plans and scale limits still need evaluation with production data; `$facet` has its own memory limits. Do not run destructive `syncIndexes()` as a deployment shortcut.

These analytics require MongoDB 5.0+ aggregation operators; use the supplied MongoDB 8 replica-set Compose setup for the full application. No new runtime dependencies were added. To verify:

```powershell
npm run test:admin
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0'
npm run test:admin:integration
npm run test:client
npm run test:client:ui
npm run lint
npm run build
```

The strict integration command fails when the database URI is missing. It creates a uniquely named database and drops only that database. Tests cover both endpoints' missing/expired/forged JWTs, non-admin access and demotion, query bounds, real zero results, current versus archived inventory, counts independent of list limits, exact interval boundaries, UTC midnight splitting, clipping, cancellation exclusion, archived usage history, activity provenance and safe projections. Dependency-free metric/chart tests and React HTTP-transport tests are included; mocked transport is confined to tests.

- Register and sign in, bcrypt password hashing, expiring JWT sessions, current-user lookup, and sign out. Registration always assigns the `user` role.
- Dedicated `/login` and `/register` pages with field-specific validation errors, a protected `/bookings` page, and an admin-only `/admin` page. Signed-out visitors return to the requested protected page after signing in. A forbidden page explains missing admin access.
- Browse active resources, search by name/location/description, and filter rooms, laboratories, and equipment. Responsive cards include images with graceful fallbacks, server pagination, and loading, empty, error, and retry states. `/resources/:id` displays complete resource information and a reservation action.
- Reserve a resource with a purpose and local start/end times, then review or cancel your reservations. The client sends ISO timestamps with UTC offsets; dates are stored as MongoDB dates and displayed in the viewer's local zone.
- Admins can add/edit resources through dialogs in a searchable, paginated management table, deactivate/reactivate them, delete them with confirmation, inspect all campus bookings, and cancel reservations. Deletion warnings and success notifications explain the outcome; history is preserved.
- Date-based availability and a transaction-based serialization strategy for overlapping reservations. Real database concurrency verification is still required in a configured replica-set environment; see the verification limits below.

## Booking rules

Bookings are immediately `confirmed`. A booking must start in the future, end after it starts, and last **at least 30 minutes and at most 4 hours**, including both boundaries. Overlap means `existing.startTime < new.endTime` and `existing.endTime > new.startTime`, so 10:00–12:00 and 12:00–13:00 are valid adjacent reservations. Cancelled bookings do not block availability. Users can cancel their own reservations until the booking ends; admins can cancel any reservation under the same time rule. Cancellation is idempotent. Public callers cannot choose a booking status.

### My Bookings and administration

`/bookings` is the personal React page, with upcoming/in-progress, past, cancelled and all tabs. Each reservation shows resource information, local start/end dates and offsets, purpose, and its actual status. Search, resource type, status, inclusive local date ranges, sorting and pagination use the real API. Empty and loading states, retry controls, cancellation confirmation and notifications are included. The separate admin route `/admin/bookings` lists campus reservations and adds member name/email search. Admins still have their own personal page. Both the UI guard and server authorization restrict the campus list.

`GET /api/bookings/me` always applies the authenticated user's ID **before** search, joins, counts and pagination; caller-supplied `user` or `scope` parameters are rejected. `GET /api/bookings` is now **admin-only**, including requests without a scope or with a forged `scope=mine`. The legacy admin `scope=all` parameter is accepted but grants no permissions. The personal endpoint no longer uses the all-bookings URL.

Both listing endpoints accept `period=all|upcoming|past|cancelled`, `status=confirmed|cancelled`, `search` (up to 100 characters), `type=room|lab|equipment`, `resource=<ObjectId>`, ISO `from` and `to` bounds, `sort=startAsc|startDesc`, `page` (default 1) and `limit` (default 20, maximum 100). The admin endpoint additionally accepts `user=<ObjectId>` and searches user name/email. A date range matches `booking.endTime > from` and `booking.startTime < to`. The UI converts inclusive local date filters to an exclusive next-day bound, including daylight-saving days.

Lists return `{ bookings, pagination, summary, asOf }`. `summary` contains `all`, `upcoming`, `past` and `cancelled` counts for the ownership/search/type/resource/date filters, before the period/status selection. Upcoming means confirmed with an end time still in the future, including sessions in progress. Past means confirmed with an end time at or before the request timestamp; cancelled history is separate regardless of its dates. Upcoming sorts soonest first by default; other views default to latest first. Pagination uses start time and ID for deterministic ordering. Resource/user joins return explicit safe fields, including archived resource details for history. Lists are not capped at the former 200-record maximum; they paginate the entire matching collection.

`PATCH /api/bookings/:id/cancel` requires authentication and accepts only the owner or a current database admin. It retains the booking, purpose, original times and references; it changes status to `cancelled` and records `cancelledAt` in the same resource-locked transaction used by the engine. The successful response occurs after commit, so a subsequent booking request can immediately reserve the released interval. It returns `{ booking, alreadyCancelled, message }`. Repeating cancellation returns HTTP 200 with `alreadyCancelled=true` and the original timestamp. Even an already-cancelled record remains forbidden to another regular user. Ended confirmed reservations cannot be cancelled; repeated cancellation of an already-cancelled past reservation remains idempotent. No history is deleted. UI cancellation controls are advisory; the server checks ownership and current state on every request.

The blocking policy is centralized in `server/src/utils/bookingRules.js` and shared by the model, overlap queries, availability, and resource deletion. Currently `confirmed` blocks and `cancelled` does not. `pending`, `approved`, and `rejected` are not supported model values. Before enabling approval, explicitly add and test their policy: the proposed workflow reserves time for both pending and approved bookings; rejected/cancelled bookings release it. Every transition into a blocking status must acquire the same resource lock and recheck overlaps. Adding enum values alone is insufficient.

Booking creation first writes `bookingVersion` on the shared resource document inside a MongoDB transaction, then revalidates times, checks overlaps, and inserts a confirmed booking in that same transaction. A competing transaction that wrote the same resource must abort/retry on its new snapshot. Different resources use different lock documents. Cancellation and resource deletion use the same resource write lock. There is no process-local mutex and no check-then-insert fallback outside the transaction. Availability checks are advisory; booking creation performs the authoritative check. Inactive and archived resources reject new bookings.

The transaction helper uses the MongoDB core transaction API with snapshot reads and majority writes. Transient transaction errors retry the complete transaction for at most **12 transaction attempts** (initial attempt plus up to 11 retries), with jittered backoff and a **10-second retry budget**. Each commit is attempted at most **3 times**. An unknown commit result retries only that same commit, never the writes. Database operations and commits have 2-second server-side limits where supported. The retry budget bounds additional attempts, not the total wall-clock time of network operations; driver/server timeouts can take longer. See [MongoDB's transaction error semantics](https://www.mongodb.com/docs/manual/core/transactions-in-applications/).

An overlap returns `409` with `error.code=BOOKING_CONFLICT` and a useful message. Invalid times use `BOOKING_START_IN_PAST`, `INVALID_BOOKING_INTERVAL`, `BOOKING_TOO_SHORT`, or `BOOKING_TOO_LONG`. Validation errors use `VALIDATION_ERROR`. Retry exhaustion returns `503 TRANSACTION_RETRY_EXHAUSTED` with `Retry-After: 1`. Unsupported standalone MongoDB returns `503 TRANSACTIONS_UNAVAILABLE` if the service is invoked without the startup topology guard; normal startup refuses standalone MongoDB entirely. Neither path falls back to unsafe writes.

If commit remains uncertain, the API returns `503 TRANSACTION_COMMIT_UNKNOWN`, tells the caller to check their bookings, and includes the proposed `bookingId` in `error.meta`. The booking may already have committed. The React form disables resubmission in this state and links to My bookings. Clients must check `GET /api/bookings/me` before submitting again. No idempotency-key protocol is currently implemented. A lost HTTP response can likewise have an uncertain result; check My bookings before manually retrying.

Timestamps must be ISO 8601 strings with `Z` or an explicit UTC offset. MongoDB stores Date instants in UTC; responses serialize to UTC `Z` timestamps. React converts local datetime inputs to UTC and formats responses in the user's local timezone. The original input zone is not stored.

### Day availability

`GET /api/resources/:id/availability?date=YYYY-MM-DD` uses a **UTC calendar day**, from midnight inclusive to the following midnight exclusive. It returns `window`, `asOf`, merged `busy` intervals, and continuous future `free` windows of at least 30 minutes. Reservations crossing midnight are clipped to the requested day. Free windows may exceed four hours; each booking must still obey the four-hour maximum. Past time is omitted from free windows. Only timestamps are public; user names, purposes, and booking IDs are not exposed. The React schedule fetches the relevant UTC days and combines them into the user's selected local day, as described below.

The existing `?startTime=<ISO>&endTime=<ISO>` availability query remains supported and returns `{ available }` for a valid future booking interval. Do not combine interval and date parameters. Availability responses are uncached snapshots and do not hold or reserve a slot.

### Booking experience

From the resource catalog or detail page, choose Reserve to open an accessible dialog. It shows the resource image, capacity, location and description, a local calendar date, occupied intervals, open windows, start/end selectors, live duration and availability feedback, and a purpose field. Review reservation opens a confirmation step containing the resource/time/purpose summary; only Confirm reservation submits a booking. Edit reservation returns to the preserved form.

The date picker represents the **user's local calendar day**. The client fetches every UTC date intersecting that local day, plus coverage for overnight bookings ending up to four hours later, then merges and clips the occupied intervals. It handles 23-hour and 25-hour daylight-saving days. Time-option values are exact UTC instants; labels include their UTC offsets so repeated fall-back clocks are distinguishable. Quarter-hour suggestions also include exact occupied-interval boundaries, allowing adjacent bookings even when a previous booking ends off the quarter hour. Overnight end choices are labelled with the following date. Local input is never converted by appending a synthetic `Z`.

Availability feedback makes a debounced real API request and discards stale responses when selections change. Known overlaps and invalid durations are explained immediately. The final `POST /api/bookings` performs authoritative validation. On HTTP 409, the dialog preserves the purpose, returns to time selection, refreshes both the schedule and interval check, and explains that someone else reserved the time. Submission uses a synchronous in-flight guard and disabled controls; closing the dialog is disabled while the request runs. A confirmed response redirects to My Bookings with a success notification that survives navigation. Ambiguous network/proxy/commit results stop resubmission and offer a link to check My Bookings first.

## Resource directory and deletion

`GET /api/resources` accepts `search` (name, location, description; at most 100 characters), `type` (`room`, `lab`, `equipment`), `page` (default 1, maximum 100000), and `limit` (default 12, maximum 100). Search is case-insensitive and treats regex characters literally. Results sort by name and ID for stable pagination. Responses contain:

```json
{
  "resources": [],
  "pagination": { "page": 1, "limit": 12, "total": 0, "totalPages": 0, "hasNextPage": false, "hasPreviousPage": false },
  "typeCounts": { "room": 0, "lab": 0, "equipment": 0 }
}
```

Out-of-range pages return an empty array and the actual totals. Category counts represent the visible inventory before search/type filters. Admins can use `includeInactive=true` to include inactive resources, and `isActive=true|false` to narrow visibility. Requesting inactive resources requires authentication and an admin role. Regular users and public visitors see only active resources, including on the detail endpoint. Authenticated admins can inspect inactive resource details. Invalid ObjectIds, types, capacities, URLs, or pagination values return 400. Capacity must be a positive integer up to 10000; optional image URLs must use HTTP(S), contain no embedded credentials, and be at most 2048 characters.

`PUT /api/resources/:id` requires the core resource fields and replaces all editable fields (omitted description/image/status take their documented defaults). Existing `PATCH` clients can continue using partial updates. Internal deletion and lock fields cannot be set through these APIs.

`DELETE /api/resources/:id` returns **409** with an explanatory warning if any confirmed booking has an end time in the future, including a booking already in progress. Past and cancelled bookings do not block deletion. Successful deletion archives the document (`isActive=false`, internal `deletedAt` timestamp), hides it from every directory/detail API, and prevents editing, reactivation, or new bookings. Historical booking references still resolve to the preserved resource document. To temporarily hide a resource while honoring existing reservations, edit its status to inactive instead of deleting it.

Deletion and booking creation acquire the same resource write lock within transactions, designed to prevent both a concurrent booking and deletion from succeeding. No cascade deletion or dangling booking references are introduced. This path still needs real replica-set integration verification in this environment.

## Scripts and checks

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the API and Vite with file watching |
| `npm run seed` | Add initial resources and configured admin |
| `npm run seed:admin` | Explicitly create only a development admin |
| `npm run lint` | ESLint for JS/TS and React Hooks |
| `npm test` | Unit tests; integration test skips without a test URI |
| `npm run test:bookings` | Dependency-free time, availability, status-policy and retry-control tests |
| `npm run test:bookings:integration` | Real HTTP/MongoDB engine tests; fails if no test URI is configured |
| `npm run test:resources` | Resource rules, request validation, and opt-in real MongoDB resource tests |
| `npm run test:client` | Dependency-free TypeScript booking/timezone tests on Node 22.18+ or Node 24 |
| `npm run test:client:ui` | Vitest + React Testing Library booking flow tests |
| `npm run typecheck -w client` | Frontend TypeScript check |
| `npm run build` | TypeScript check and optimized client build |
| `npm run check` | Lint, tests, and client build |
| `npm start` | Start the API; also serve the built client in production |

Run the real database integration test against a replica set:

```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0'
npm test
```

For the strict booking concurrency suite, keep that environment variable set and run:

```sh
npm run test:bookings:integration
```

Unlike the general test discovery command, this command fails instead of silently skipping when `MONGODB_TEST_URI` is missing. The suites verify a writable replica set and create uniquely named databases. Engine tests send five simultaneous competing HTTP requests, check that exactly one is inserted and the rest receive 409, and test all overlap shapes, adjacency, cancellation/reuse, resource isolation, durations, UTC offsets and the final non-overlap invariant. My Bookings tests cover personal data isolation, admin-only access, filters and pagination, ownership checks before/after cancellation, preserved history, immediate rebooking by another member, admin cancellation, simultaneous owner/admin cancellations, idempotence and past records. Only their own generated test databases are dropped. Dependency-free retry tests use simulated sessions to test control flow; they **do not prove database serialization**.

The integration test creates a uniquely named database, exercises real password hashing/JWT authentication, authorization, duplicate emails, concurrent bookings, adjacent reservations, cancellation, availability, and deactivation/history. It drops only its own generated database afterward. The connection's account must have permission to create and drop that test database. Unit tests cover time rules, validation, role escalation prevention, and partial-update behavior.

The separate auth integration suite tests registration and stored bcrypt hashes, case-insensitive duplicate emails, correct and incorrect login, missing/malformed/expired/forged JWTs, safe profiles, forbidden admin endpoints, seed safety, account deletion, and immediate enforcement of role demotion. Token unit tests verify signature algorithms, issuer/audience scoping, expiry, required expiration claims, and invalid subjects without needing a live database. These tests require installed server dependencies. Run `node --test server/test/auth-token.test.js` for the token/seed policy tests, or `npm test` for all suites; database suites skip unless `MONGODB_TEST_URI` is set.

The resource integration suite tests real HTTP CRUD, admin-only writes, ObjectIds and field validation, inactive visibility, search and pagination, upcoming/in-progress deletion restrictions, preserved historical references, and concurrent booking versus deletion. It also uses a uniquely named disposable database and requires a replica set. Run it with the same `MONGODB_TEST_URI` configuration and `npm run test:resources`.

Dependency-free booking rules can also be checked with `node --test server/test/booking.test.js`.

## REST API

JSON request and response bodies. Authenticated endpoints expect `Authorization: Bearer <token>`. Registration/login return `{ user, token }`; collections return `{ resources }` (with pagination metadata) or `{ bookings }`. Errors use `{ "error": { "code": "BOOKING_CONFLICT", "message": "..." } }`, with additional `details` for validation errors and optional safe `meta` for recovery information.

| Method | Endpoint | Access / body |
| --- | --- | --- |
| GET | `/api/health` | Database readiness; 503 when disconnected |
| POST | `/api/auth/register` | `{ name, email, password }` |
| POST | `/api/auth/login` | `{ email, password }` |
| GET | `/api/auth/me` | Signed in |
| GET | `/api/resources` | Public active listing; `type`, `search`, `page`, `limit`; admin-only inactive filtering |
| GET | `/api/resources/:id` | Public active resource; authenticated admins can also see inactive resources |
| GET | `/api/resources/:id/availability` | Public; `date=YYYY-MM-DD` (UTC day); legacy ISO start/end query also supported |
| POST | `/api/resources` | Admin; `{ name, type, capacity, location, description?, imageUrl?, isActive? }` |
| PUT | `/api/resources/:id` | Admin; full editable resource fields |
| PATCH | `/api/resources/:id` | Admin; partial resource fields |
| DELETE | `/api/resources/:id` | Admin; archive only if no upcoming/ongoing confirmed booking; otherwise 409 |
| GET | `/api/bookings` | Admin-only campus list with filters, member search, counts and pagination |
| GET | `/api/bookings/me` | Signed in; own bookings only, with filters, counts, pagination and cancelled history |
| POST | `/api/bookings` | Signed in; `{ resource, startTime, endTime, purpose }` |
| PATCH | `/api/bookings/:id/cancel` | Owner or admin |
| GET | `/api/admin/dashboard` | Admin; aggregated KPIs, resource distribution, upcoming list and recorded activity |
| GET | `/api/admin/dashboard/utilization` | Admin; bounded confirmed scheduled hours, daily UTC buckets and ranked resources |

Validation failures return 400, authentication failures 401, forbidden actions 403, missing records 404, and duplicate emails, overlapping bookings, or blocked resource deletions 409. Auth attempts and API traffic are rate limited; rate-limit responses use the same error envelope. Resource and booking lists are paginated at up to 100 records per page.

## Structure

```text
client/
  src/               React interface, typed API client, Tailwind/styles
    components/      Accessible modal, auth, booking, resource forms
    hooks/           Debounced search and cancellable paginated resource fetches
    auth/            Server-verified auth context and protected route guards
    pages/           Login, registration, and resource detail pages
    Router.tsx       Public, authenticated, admin, and fallback routes
  vite.config.ts     Development proxy
server/
  src/
    config/          Validated environment configuration
    models/          Mongoose schemas and indexes
    middleware/      JWT authentication and admin authorization
    routes/          REST endpoints and request validation
    services/        Authentication and transactional booking logic
    utils/           Shared validation, booking rules, error handling
    app.js           Express application, separate from startup
    index.js         Database connection, indexes, server lifecycle
    seed.js          Non-destructive seed command
  test/              Unit tests and opt-in real MongoDB integration test
```

## Production

Install dependencies, build the client, and configure `server/.env` with `NODE_ENV=production`, the real `CLIENT_ORIGIN`, a strong `JWT_SECRET`, and a replica-set/Atlas URI. Run `npm start`. Express serves `client/dist` and the API from the same origin. Terminate HTTPS at your hosting platform/reverse proxy. If using a proxy, configure Express's `trust proxy` for the actual deployment before relying on per-client rate limiting; it is deliberately not enabled for arbitrary proxies.

Tokens expire after one hour by default. `JWT_TTL_SECONDS` accepts 900–28800 seconds. The API pins HS256 and requires the expected issuer, audience, expiration, issued-at time, and a valid user ID. Every authenticated request loads the current database account, so deletion and role demotion take effect immediately. Authentication responses use `Cache-Control: no-store`. Public registration explicitly selects name/email/password and assigns `role=user` regardless of extra request fields. Passwords use bcrypt cost 12 and a 72-byte maximum; unknown-account logins also perform a bcrypt comparison. API profiles are explicit field allowlists, and unexpected server logs omit request bodies and error values.

Only the bearer token is stored in browser session storage. The client verifies it through `/auth/me` before granting access to protected routes, rechecks on tab focus, clears it on expiration or an authenticated 401, and never restores roles from browser storage. Server authorization remains authoritative. Signing out clears the local token; copied tokens remain valid until expiry. There is no server-side token revocation, refresh-token, or password-reset workflow in this foundation. Session storage remains accessible to scripts on the same origin, so retain Helmet/CSP protection and avoid untrusted scripts or HTML. Never expose seed passwords or database credentials in client environment variables. Protect MongoDB with appropriate network restrictions and credentials for hosted deployments.

## Verification in the build environment

**The complete release gate passed.** Current results, recovery details, all six HTTP acceptance outcomes, fixes, limitations and exact local commands are in [docs/environment-recovery.md](docs/environment-recovery.md). The [initial QA audit](docs/qa-audit.md) is retained as historical evidence.

Executed results on Windows / Node 24.19 / native MongoDB 7.0.37 replica set:

- `npm test`: 111 server tests/subtests passed, zero failures or skips.
- `npm run test:integration`: 63 reported tests/subtests across seven real HTTP/Mongoose integration files passed, zero skips. These tests are also included in the full server total.
- `npm run test:rules`: 37 passed; `npm run test:client`: 28 passed; `npm run test:client:ui`: all 21 React tests passed.
- ESLint, TypeScript, Vite production build and `npm run check:release`: exit 0.
- Real HTTP concurrency tests verified one winner/four conflicts across five rounds and checked persisted non-overlap. Cancellation/rebooking, adjacency, ownership, JWT/admin access, resource CRUD/archive restrictions and dashboard aggregation accuracy passed.

Dependency recovery used 414 integrity-verified locked archives from the readable npm cache. A genuine lockfile is now included; a serialized clean `npm ci --offline --cache .npm-cache --ignore-scripts --no-audit --no-fund` installed 417 packages successfully. Native bcrypt and esbuild runtime checks passed afterward. External registry access remains denied before TLS in this offline account; TLS verification and global security settings were not weakened. `npm run doctor` reports these conditions without exposing credentials.

Vite now uses its built-in automatic JSX/TSX transform, avoiding SWC's incompatible native cache. Local development updates use ordinary Vite reload behavior rather than SWC Fast Refresh. The React conflict flow now retains stable accessible field names when validation errors appear.

The current application runs at **http://127.0.0.1:5174/** (5173 was occupied), with API port 5000 and the dedicated native replica set on 27018. Local configuration and generated secrets are in ignored `server/.env`; the explicit development seed created/preserved six resources and the administrator. Use the Vite URL actually printed by `npm run dev`.

```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:27018/?replicaSet=campusQa'
npm run check:release
npm run dev
```

A fresh clone needs a registry-enabled `npm ci` or a suitable verified cache; the cache itself is ignored by git. The current workspace's native replica-set directory is already initialized. See the recovery report for restarting it or using Docker/Atlas. An optional headless Chrome attachment timed out, so no live visual/responsiveness audit is claimed; React component tests and live frontend/proxy/API smoke checks passed. Single-node testing does not establish production failover or a complete accessibility/security audit.
