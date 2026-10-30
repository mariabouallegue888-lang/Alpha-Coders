# Campus Resource Booking: stabilization audit

Historical initial audit. The environment was subsequently recovered and the full release gate passed; see [environment-recovery.md](environment-recovery.md) for current executed results and launch commands. The blocked outcomes below describe the earlier environment, not the current release status.

Audit date: 2026-10-30. Workspace: `D:\Projects\Hackthon`. Runtime used: Node 24.19.0 / npm 11.17.0 / Windows PowerShell. This report describes executed results, not an assumption that previously implemented features work.

**Release status: BLOCKED.** The runnable rules/API-client tests and a real MongoDB transaction-protocol diagnostic pass. The application cannot currently start in this environment because required npm packages are absent and registry access fails with `EACCES`. Full HTTP integration, React component tests, lint, typecheck, build and browser acceptance are not verified. No application-level concurrency or end-to-end release approval is claimed.

## Actual application inventory

| Area | Existing implementation inspected |
| --- | --- |
| Monorepo | Root npm workspaces `client` / `server`; scripts, environment example, gitignore, README, ESLint flat configuration; no generated lockfile |
| API process | `server/src/app.js`: Express 5, Helmet, CORS, JSON size limit, rate limiting, readiness health endpoint, consistent error handler, production static hosting. `index.js`: MongoDB connection, replica-set/mongos check, index initialization and shutdown |
| Authentication | `routes/api.js`, `services/authService.js`, `tokenService.js`, `middleware/auth.js`, `utils/profile.js`: registration/login/me, bcrypt cost 12, JWT signature/issuer/audience/expiry validation, database account lookup and current role enforcement |
| User schema | Unique lowercased email, name, password selected out by default, user/admin role, timestamps; safe output field allowlist. Public registration always chooses `role=user` |
| Resource schema | Name, room/lab/equipment type, positive integer capacity, location, description, safe HTTP(S) image URL, active flag; internal `deletedAt` archive marker and `bookingVersion` serialization counter |
| Booking schema | Owner/resource references, UTC start/end dates, purpose, confirmed/cancelled status, rejection reason, cancellation time, timestamps and compound indexes. Pending/approved/rejected are deliberately unsupported |
| Resource services | `resourceService.js` / `resourceRules.js`: visibility, escaped search, type/status filters, pagination, create/replace/patch and transactional archive. Historical resource references are retained |
| Booking services | `bookingService.js`: transactions, resource lock write, overlap check, creation, authorized cancellation, UTC availability. `bookingListService.js` / `bookingManagement.js`: owner-scoped joins, filters, summaries and admin listings |
| Analytics | `adminDashboardService.js`: inventory counts, booking counts, upcoming list, four recorded activity streams, bounded clipped scheduled-hours aggregation with UTC daily buckets and ranking; no invented utilization percentage |
| React entry/routes | `main.tsx`, `Router.tsx`, `App.tsx`; React 18, Vite, TypeScript, Tailwind. Public catalog/details/auth pages; protected member and admin screens |
| Frontend auth | `AuthContext.tsx`, `ProtectedRoute.tsx`, `AuthPage.tsx`, `AuthForm.tsx`: server-verified profiles, token expiration and focus recheck, session storage, logout, route guards and validated sign-in/registration forms |
| Resource UI | `ResourceCatalog`, `ResourceFilters`, `ResourceImage`, `ResourceArtwork`, `ResourceDetailPage`, `AdminResources`, `ResourceForm`, `useResourceList`: real API reads/writes, search, pagination, dialogs and resource image fallback |
| Booking UI | `BookingForm`, `DayAvailability`, `useBookingAvailability`, `booking/time.ts`: local/UTC conversion, DST-aware choices, occupied intervals, validation, review, duplicate-submit prevention, conflict refresh and ambiguous-outcome handling |
| Booking history | `BookingsPanel`, `useBookings`, `booking/myBookings.ts`: upcoming/past/cancelled groups, filters, local date bounds, owner/admin cancellation and preserved history |
| Dashboards/shared UI | `DashboardPage`, `AdminDashboardPage`, `AdminCharts`, `AppShell`, `Modal`, `Pagination`, `ui.tsx`, design tokens and responsive styles; accessible navigation, notices, skeletons and empty states |
| Configuration | `client/vite.config.ts`: `/api` proxy to port 5000; `vitest.config.ts`: jsdom + Testing Library; Tailwind/PostCSS/TypeScript configs. Docker Compose: MongoDB 8, `rs0`, loopback binding, persistent volume and writable-primary healthcheck |
| Seeding | Explicit development-only `seed` and `seed:admin`; environment credentials, hashed admin password, no startup seed, no promotion/reset of existing users; sample resources only when explicitly seeded |
| Tests | Node's test runner for server rules and real HTTP/MongoDB integrations; native TypeScript frontend logic/API-client tests; Vitest/Testing Library component tests. Existing test framework was retained |

Actual REST routes:

| Method | Route | Access |
| --- | --- | --- |
| GET | `/api/health` | Public readiness |
| POST | `/api/auth/register`, `/api/auth/login` | Public, rate limited |
| GET | `/api/auth/me` | Verified JWT |
| GET | `/api/resources`, `/api/resources/:id` | Public active resources; verified admin for inactive records |
| GET | `/api/resources/:id/availability` | Public active resource, UTC `date` or explicit interval |
| POST | `/api/resources` | Verified JWT + admin |
| PUT/PATCH/DELETE | `/api/resources/:id` | Verified JWT + admin |
| POST | `/api/bookings` | Verified JWT |
| GET | `/api/bookings/me` | Verified JWT, own records only |
| GET | `/api/bookings` | Verified JWT + admin |
| PATCH | `/api/bookings/:id/cancel` | Verified JWT, owner/admin checked in service |
| GET | `/api/admin/dashboard`, `/api/admin/dashboard/utilization` | Verified JWT + current database admin role |

Actual browser routes: `/`, `/login`, `/register`, `/resources/:id`, `/dashboard`, `/bookings`, `/admin`, `/admin/bookings`, `/admin/dashboard`, `/forbidden`, plus a 404 route. Server authorization remains required regardless of frontend guards.

## Mandatory acceptance checklist

`PASS (protocol)` means executed against real MongoDB using native driver operations mirroring the service and importing the application's actual transaction helper, interval predicates and cancellation policies. It does **not** mean an HTTP request passed through Express/Mongoose. The separate HTTP acceptance suite remains blocked.

| Scenario | Executed result | Full application HTTP result |
| --- | --- | --- |
| A reserves Room A 10:00–12:00 | PASS (protocol): confirmed record committed | BLOCKED: Mongoose unavailable; expected HTTP 201 |
| B requests Room A 11:00–13:00 | PASS (protocol): structured booking conflict with status 409; no insert | BLOCKED: expected HTTP 409 |
| B reserves Room A 12:00–13:00 | PASS (protocol): adjacent interval committed | BLOCKED: expected HTTP 201 |
| A cancels original; B rebooks 10:00–12:00 | PASS (protocol): cancellation preserved and replacement committed | BLOCKED: cancellation/availability endpoints not exercised |
| Regular member calls admin endpoint | NOT VERIFIED: code inspection confirms JWT + role middleware | BLOCKED: expected HTTP 403 |
| Past start / end before start | PASS (rules + protocol): rejected before insertion with structured 400 policies | BLOCKED: expected HTTP 400 |

These exact scenarios are now expressed as named subtests in `server/test/acceptance.integration.test.js`. Dates use fixed UTC hours on January 15 of the next calendar year, derived once per run; the real server clock is not mocked. A dependency-free test checks the calendar helper. The suite creates a random `campus_acceptance_test_<uuid>` database, verifies a writable replica set, initializes real indexes, creates real users/resources, exercises real HTTP and drops only its own database. Its assertions have not executed in this environment.

## Additional acceptance checklist

| Area | Result and evidence |
| --- | --- |
| JWT signature/expiry/issuer/audience and account demotion | BLOCKED: token test cannot load `jsonwebtoken`; real HTTP suite cannot load Mongoose. Source inspected; existing tests cover these cases |
| Password hashing, unique registration and validation | BLOCKED: bcrypt/JWT/Zod/Mongoose dependencies absent. Safe-profile allowlist unit test PASS |
| Admin resource CRUD | BLOCKED at HTTP dependency loading; existing resource integration suite and new acceptance cases cover actual API operations |
| Delete resource with future/in-progress bookings | PASS for deletion-filter unit rules; real transaction/HTTP archive scenario BLOCKED |
| Booking ownership | PASS for policy tests and real database-protocol foreign cancellation rejection; HTTP ownership tests BLOCKED |
| Minimum 30 minutes / maximum 4 hours | PASS for exact boundaries and outside-boundary rejection in rules and real database protocol; HTTP assertions BLOCKED |
| Competing bookings | PASS for real database-protocol contention and persisted non-overlap invariant; actual service HTTP concurrency suite BLOCKED |
| Cancellation and rebooking | PASS for real protocol cancellation, idempotence, retained history and released-slot rebooking; HTTP suite BLOCKED |
| Resource isolation | PASS for real protocol: a separate resource accepted the same interval |
| Search/filtering/pagination | Escaped-filter and ownership/date policy tests PASS; HTTP queries BLOCKED |
| Dashboard accuracy | Inventory/window/daily-fill/activity unit tests PASS; real MongoDB aggregation endpoint suite BLOCKED |
| Timezone, DST, adjacency and local date filtering | PASS in native frontend tests, including 23-/25-hour days and non-quarter-hour adjacency |
| API client, conflicts and expiration event | PASS with mocked transport using the actual API helper; these are client unit tests, not end-to-end server tests |
| Booking review/loading/error/cancel flows | Existing React tests present; BLOCKED because Vitest/React dependencies are missing |
| Responsive layout/mobile navigation | Responsive CSS and navigation/focus code inspected. Browser rendering, keyboard audit, overflow and visual checks NOT VERIFIED |
| ESLint / TypeScript / production build | FAILED TO START: missing `eslint`, `tsc`, `vite`; no clean-lint/build claim |
| API startup | FAILED TO START: Mongoose missing; no running full application claim |

## Database concurrency evidence

Production booking creation uses `runTransaction()` with snapshot read concern, majority write concern and primary reads. The **first database operation** is a `$inc` of the shared resource's `bookingVersion` using an active/non-archived predicate. It then checks the strict overlap formula `existing.startTime < requested.endTime && existing.endTime > requested.startTime`, and inserts a confirmed booking in the same transaction. Cancellation and archive also write that shared resource; their competing snapshots cannot commit independently of the lock. The transaction helper retries labelled transient conflicts with bounded attempts/time, retries the same commit for uncertain commits, and does not fall back to an unsafe standalone write. Startup rejects standalone MongoDB. This was confirmed by source inspection; it is not an alternative sequential find-then-insert implementation.

A new optional `npm run test:db:probe` diagnostic executed against a dedicated loopback MongoDB **7.0.37** process on port **27018**, replica set **campusQa**, with `isWritablePrimary=true`. It loads the unchanged application retry helper and rule modules, then uses mongosh's embedded native driver to exercise the shared-document transaction protocol in a separate disposable database. It is deliberately labelled a protocol diagnostic because it does not load Mongoose models or Express middleware.

Final executed diagnostic result:

```json
{
  "competingAttempts": 25,
  "confirmedWinners": 5,
  "conflicts": 20,
  "transientRetries": 33,
  "result": "PASS"
}
```

Five competitors ran concurrently in each of five rounds. Exactly one committed per round and four received the booking-conflict policy. The final persisted confirmed set was checked for overlapping pairs. The probe requires a real transient transaction retry to occur; this assertion passed. Retry counts vary naturally with scheduling. No application database was used or dropped. The replica-set data directory is under ignored `.local-data/qa-mongo`; the temporary process is stopped after verification.

**Remaining critical gate:** run the seven HTTP/Mongoose integration suites after dependency installation. Passing the protocol probe alone is insufficient to approve application concurrency. It also relies on an internal mongosh driver handle and Node support for requiring ES modules; incompatible mongosh versions must fail explicitly and use the full HTTP suite instead. The diagnostic is not a production dependency.

## Bugs and verification gaps fixed

1. **API silently accepted unreadable successful responses.** JSON parse failure or JSON `null` was returned as a successful typed value, causing downstream null dereferences and misleading mutation feedback. `api.ts` now throws structured `INVALID_RESPONSE`; the booking form already treats this as an ambiguous outcome and directs the user to check history before resubmitting. Regression tests executed for invalid JSON, empty body and null JSON.
2. **Request headers could disappear.** Spreading a `Headers` instance or tuple array as an object discarded custom headers. The client now normalizes through `new Headers()`, retains supplied header forms, adds JSON content type when absent and applies the current explicit bearer token. Native regression tests passed. The existing booking component assertion was updated to inspect headers through the standard API.
3. **Database suites could be skipped by the general test command.** Added strict `test:integration`, which requires a URI, discovers all seven actual integration files, runs them serially in isolated processes and propagates failure. `check:release` now includes this gate. With the configured test URI, execution reported seven dependency-load failures and zero skips, rather than a misleading green result.
4. **No explicit A/B acceptance sequence.** Added named, actual HTTP scenarios plus a five-round concurrency/invariant test, deterministic future UTC fixtures, guarded disposable-database cleanup and 30-second request timeouts. These additions are authored and syntax-checked but HTTP assertions remain unexecuted.
5. **Advertised Node minimum did not support the native TypeScript test setup.** Updated engines/docs to Node 22.18+ and enabled native type transformation for the API client's TypeScript parameter properties. Node 24.19 executed the complete frontend logic suite successfully; Node 22.18 was not available for a second runtime check.
6. **Diagnostic failure could falsely exit green.** During development, mongosh ignored `process.exitCode=1` in an asynchronous catch. Changed the probe to `quit(1)`. An intentional asynchronous failure was executed and its exit code verified as 1. The final passing diagnostic then exited 0. The normal Node integration runner already propagates test failures.
7. **Production resource photos were blocked by the default image policy.** The server used unconfigured Helmet while the resource schema and image component support external HTTP(S) photos. Helmet's [documented default policy](https://helmet.js.org/) only permits same-origin/data images. Configured the image directive to allow the validated schemes while retaining the default same-origin script policy; HTTPS upgrading remains enabled in production and is disabled for local HTTP development/test. Production HTTP-only image hosts still need HTTPS support. Added a real HTTP header regression assertion; it remains blocked by the missing backend dependencies. No rendered-photo verification is claimed.

No booking concurrency defect was reproduced in the protocol probe. No unexecuted HTTP, UI or aggregation assertion is listed as a fixed or passing feature.

## Commands executed and results

| Command | Observed result |
| --- | --- |
| `npm install --cache .npm-cache --fetch-retries=0 --fetch-timeout=15000 --no-audit --no-fund` | FAIL: registry fetch denied with EACCES |
| `npm install --offline --cache .npm-cache --no-audit --no-fund` | FAIL: ENOTCACHED |
| `docker info` | FAIL: daemon pipe unavailable; native MongoDB used instead |
| `npm run test:rules` / equivalent explicit Node file list | PASS: 36 tests, 0 failures, 0 skips |
| `npm run test:client` | PASS: 28 tests, 0 failures, 0 skips; native type-transform experimental warning expected |
| `npm run test:db:probe` with test replica-set URI | PASS: final result above; disposable test database dropped |
| `npm run test:integration` with test replica-set URI | FAIL: 7 suites fail to load Mongoose; 0 passing/0 skipped; HTTP assertions did not run |
| `npm run test:integration` without a URI | FAIL as intended: explicit configuration error instead of skipped acceptance tests |
| `npm test` without test URI | 36 tests pass; 2 dependency-load failures (`jsonwebtoken`, `zod`); 7 DB suites skipped; overall FAIL |
| `npm run lint` | FAIL: eslint unavailable |
| `npm run typecheck` | FAIL: tsc unavailable |
| `npm run build` | FAIL: tsc unavailable before Vite |
| `npm run test:client:ui` | FAIL: vitest unavailable |
| `npm start` with valid test environment values | FAIL: cannot import mongoose |
| `npm run check:release` | FAIL: stops at missing ESLint; individual later commands were also attempted separately |
| Node syntax checks for server source/tests/scripts and CJS probe; package JSON parse | PASS |

## Exact startup and verification commands

Run in the repository root using **Node 24** (recommended; minimum declared version 22.18) and npm 10+. First provide registry access; no lockfile has been fabricated. After a successful install, retain/commit the generated lockfile and use `npm ci` for reproducible installs.

```powershell
npm install
Copy-Item .env.example server/.env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Edit `server/.env`: set the generated `JWT_SECRET`, a unique `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, and `NODE_ENV=development`. Do not reuse the sample seed password. The default URI is `mongodb://127.0.0.1:27017/campus_booking?replicaSet=rs0`.

```powershell
docker compose up -d --wait
docker compose exec mongo mongosh --quiet --eval 'db.hello().isWritablePrimary'
npm run seed
npm run dev
```

The primary check must print true. Vite: `http://localhost:5173`. API: `http://localhost:5000/api`. `seed` is optional demo data plus admin; use `npm run seed:admin` for only an admin. Never use the application database as a disposable test database; the suites choose their own names even when given the same cluster URI.

```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0'
npm run test:rules
npm run test:client
npm run test:integration
npm run test:client:ui
npm run lint
npm run typecheck
npm run build
npm run check:release
```

`check:release` is the complete gate. It must pass before accepting a release. Optional mongosh protocol diagnostic: `npm run test:db:probe`; set `MONGOSH_BINARY` if mongosh is not on PATH.

For native Windows MongoDB instead of Docker, use the isolated configuration exercised here. In terminal one:

```powershell
New-Item -ItemType Directory -Force .local-data/qa-mongo | Out-Null
& 'C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe' --dbpath "$PWD\.local-data\qa-mongo" --port 27018 --bind_ip 127.0.0.1 --replSet campusQa
```

In terminal two, initialize a fresh directory once, then check the primary (wait/repeat until true):

```powershell
mongosh 'mongodb://127.0.0.1:27018/?directConnection=true' --eval "rs.initiate({_id:'campusQa',members:[{_id:0,host:'127.0.0.1:27018'}]})"
mongosh 'mongodb://127.0.0.1:27018/?directConnection=true' --eval 'db.hello().isWritablePrimary'
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:27018/?replicaSet=campusQa'
npm run test:integration
npm run test:db:probe
```

The current ignored audit directory is already initialized as `campusQa` with member `127.0.0.1:27018`; restarting it only needs the primary check, not another initiation. Set the application's own `MONGODB_URI` to that port/set if using it for development. Do not modify an unrelated MongoDB service. Stop the dedicated foreground instance with Ctrl+C after testing.

For production, set real production environment values and HTTPS/origin configuration, run `npm run build`, then `npm start`. That production path has not built or started successfully in this audit environment.

## Remaining limitations

- The missing-package/network restriction prevents verifying a working full MERN process here; resolving it and rerunning `check:release` is required.
- A successful real protocol diagnostic does not replace service/HTTP concurrency, authentication, CRUD or dashboard aggregation tests.
- Browser responsiveness, keyboard/screen-reader behavior, rendered accessibility and visual regressions remain untested. Static CSS and unit contrast tests are not a browser audit.
- MongoDB testing used one local replica-set node. Failover, multi-node elections, network partitions and sustained production load were not tested.
- Admin dashboard reads share temporal boundaries but are not an atomic cross-collection snapshot; utilization is scheduled hours, not attendance or opening-hour occupancy.
- Existing operational limits remain: bearer tokens are stored in session storage and have no server revocation/refresh workflow; role demotion/account deletion are checked from MongoDB on requests. The README documents these tradeoffs.
