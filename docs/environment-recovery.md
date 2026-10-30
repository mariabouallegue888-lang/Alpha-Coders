# Environment recovery and final validation

Date: 2026-10-30. Platform tested: Windows x64, Node 24.19.0, npm 11.17.0, MongoDB 7.0.37.

**Outcome: dependency recovery succeeded, the complete release gate passed, and the application is running locally.** This supersedes the blocked status recorded in the initial [QA audit](qa-audit.md). The results below were executed; database tests were not skipped or replaced with mocks.

## Dependency installation

The original `EACCES` was a network permission failure in the `CodexSandboxOffline` execution account. DNS resolved the public npm registry, but opening a TCP connection to port 443 failed before TLS. Create/rename/delete probes succeeded in `.npm-cache` and `node_modules`. No npm or environment proxy was configured; npm `strict-ssl=true` and TLS verification remained enabled. Changing file ownership or disabling certificate checks would not have repaired that failure.

No package lock or shrinkwrap existed at the beginning of recovery. A successful offline install produced a genuine npm v3 `package-lock.json`. The default user cache was readable. **414 lockfile-matching package archives were copied into the workspace cache and verified against their locked integrity values**, without modifying the source cache or unrelated projects. After updating the build configuration, a standalone clean reinstall succeeded:

```powershell
npm ci --offline --cache .npm-cache --ignore-scripts --no-audit --no-fund
```

Observed result: **417 packages installed, exit 0**. A redundant install had overlapped an earlier attempt, so the final clean install was repeated on its own before release validation. Native bcrypt hashing/comparison and esbuild TypeScript transformation were then executed successfully. Package install scripts were not needed or authorized globally. No lockfile or package integrity value was fabricated.

External registry access remains denied in this session, but it no longer blocks this application's cached installation or validation. `npm run doctor` reproduces the network/cache/module diagnosis with credentials redacted; it now exits 0 when installed dependencies resolve and workspace writes work, while explicitly reporting registry failures. It does not claim that resolving modules alone replaces the release gate.

## Database and local configuration

Docker's daemon was unavailable. The existing native installation was started with the dedicated workspace data directory `.local-data/qa-mongo`, loopback port **27018**, replica set **campusQa**. The existing set configuration was preserved. `hello` reported `isWritablePrimary=true`; real transaction, commit, conflict/retry and cancellation tests subsequently passed.

Test suites use generated databases, such as `campus_acceptance_test_<uuid>`, and drop only their own databases. Application data lives separately in `campus_booking`. The explicit development seed created/preserved the administrator and six demo resource records; no fake client fallback was added. Existing account passwords and resource records are preserved by the seed implementation.

`server/.env` is ignored by git. Template JWT/seed-password values were replaced with generated secrets, and the template Docker URI was changed to the working native URI. Non-placeholder configuration values were preserved. Secrets and issued tokens were not printed. The local administrator's configured login values remain in that local file; there is no hardcoded public admin password.

## Defects fixed during actual execution

| Defect | Fix and verification |
| --- | --- |
| Five competing HTTP requests could exhaust retries and return 503 instead of four booking conflicts | Raised the default ceiling from 5 to **12 transaction attempts**, retaining the **10-second retry budget**, jitter, majority/snapshot semantics, 3 commit attempts and uncertain-commit protections. Added a default-policy regression test. Five rounds of five real competing HTTP requests now pass with one 201 and four structured 409 responses per round; persisted confirmed intervals do not overlap |
| SWC native binding rejected the execution account's user-cache ownership/permissions | Removed the unnecessary React/SWC plugin and used Vite's supported built-in esbuild automatic JSX/TSX transform for development, build and tests. No global ACL or native-cache security checks were weakened. Development edits use ordinary Vite reload behavior rather than SWC Fast Refresh |
| TypeScript did not see Testing Library matcher augmentation | Included the existing test setup and Vitest configuration in the TypeScript program. Typecheck and the production build pass without suppressing errors |
| After a booking conflict, validation text changed the end-time selector's accessible name | Added stable `aria-labelledby` names to start/end/purpose controls while retaining error descriptions. The original React conflict-refresh/purpose-preservation/adjacency test now passes |
| UI tests exceeded a five-second deadline under simultaneous jsdom work | Bounded workers to two and used a 15-second per-test ceiling. Assertions and all test cases remain enabled; all 21 React tests pass |
| General backend test discovery could overload local replica-set initialization | Serialized backend test files, matching the strict integration runner. Database and concurrency assertions remain unchanged |
| Development seeding rejected the unchanged template password | Replaced only template configuration values with generated local secrets; the normal development seed then succeeded. Seed safety was retained |

The resource lock remains the first database operation in booking creation. Overlap verification and insertion occur in that same MongoDB transaction. There is no sequential check/insert fallback, in-memory mutex, or transaction-disabled test shortcut.

## Final executed commands

| Command | Final result |
| --- | --- |
| `npm ci --offline --cache .npm-cache --ignore-scripts --no-audit --no-fund` | **PASS**, 417 packages installed |
| `npm run test:rules` | **PASS**, 37 tests, 0 failed/skipped |
| `npm run test:client` | **PASS**, 28 tests, 0 failed/skipped |
| `npm run test:client:ui` | **PASS**, 21 tests in 4 files |
| `npm test` with test replica-set URI | **PASS**, 111 reported server tests/subtests, 0 failed/skipped |
| `npm run test:integration` with test replica-set URI | **PASS**, 63 reported tests/subtests across 7 actual integration files, 0 failed/skipped |
| `npm run lint` | **PASS**, exit 0 |
| `npm run typecheck` | **PASS**, exit 0 |
| `npm run build` | **PASS**, TypeScript and Vite production build |
| `npm run check:release` | **PASS**, exit 0; includes lint, all server tests, frontend tests, React tests, build and strict HTTP integrations |
| `npm run doctor` | **PASS for offline validation readiness**, with registry access explicitly reported denied |

The 63 integration results are also included in the full server run; they are not 63 additional unique tests. Node counts parent tests and subtests in its totals. The first full HTTP attempt did fail with a contention-related 503; the table reports the final rerun after the fix. Initial React timeouts and the accessible-label failure were also fixed and rerun, not omitted.

The release transcript is retained locally in `.local-data/recovery-release.log` (ignored by git). Production artifacts were generated under `client/dist`: approximately 73 kB CSS and 280 kB JavaScript before compression, plus HTML. These are build artifacts, not a claim of a hosted deployment.

## Mandatory HTTP acceptance checklist

All scenarios below ran through the real Express routes, JWT middleware, Mongoose models and MongoDB replica-set transactions in isolated test databases, using deterministic future UTC dates.

| Scenario | Expected | Actual final result |
| --- | --- | --- |
| User A reserves Room A 10:00–12:00 | Success | **PASS — HTTP 201**, confirmed booking stored |
| User B requests Room A 11:00–13:00 | Conflict | **PASS — HTTP 409**, `BOOKING_CONFLICT`, no overlapping insert |
| User B reserves Room A 12:00–13:00 | Success | **PASS — HTTP 201**, adjacent interval accepted |
| A cancels the original booking; B rebooks the released 10:00–12:00 interval | Released availability | **PASS**, cancellation preserved, availability released, replacement HTTP 201 |
| Regular user accesses admin endpoints | Forbidden | **PASS — HTTP 403** for campus bookings, inactive inventory and both analytics endpoints |
| End before start or past start | Rejected | **PASS — HTTP 400** with structured errors and no new record |

Additional passing HTTP coverage includes bcrypt hashing, registration/unique email validation, invalid/expired/forged tokens, immediate role demotion, safe profiles, admin CRUD, inactive visibility, positive capacity/ObjectIds/URL validation, search/filter/pagination, booking ownership, exact 30-minute/4-hour bounds, cancellation idempotence and simultaneous cancellation, concurrent booking versus archive, historical references, UTC normalization, day availability and real dashboard aggregation accuracy.

## Live application smoke checks

After the release gate, `npm run dev` started the API on **5000** and Vite on **5174**. Port 5173 was already occupied; its listener was not stopped or changed.

Executed live checks, outside mocked frontend transport:

- `GET http://127.0.0.1:5000/api/health`: **200**, MongoDB connected.
- Login using the locally configured seeded administrator: **200**, admin role returned; no password property exposed and the token was not logged.
- Authenticated `GET /api/admin/dashboard`: **200**, six total and active resources; zero upcoming/cancelled/in-progress reservations, matching the seeded database rather than invented demo metrics.
- `GET http://127.0.0.1:5174/`: **200**, actual Vite frontend entry present.
- `GET http://127.0.0.1:5174/api/resources`: **200**, real proxy response with six resources.

A separate optional headless Chrome visual smoke attempt timed out attaching `Page.enable`; no screenshot/responsiveness pass is claimed from that attempt. The 21 React tests and live HTTP/frontend-proxy checks passed. A manual visual/keyboard audit remains advisable; it is not a blocker to the executed release gate.

## Exact launch and verification commands

The current workspace already has dependencies, configured local secrets, demo seed records and a running replica set. If the application processes have stopped:

```powershell
npm run dev
```

Use the Vite URL printed in the terminal: currently **http://127.0.0.1:5174/** because 5173 was occupied. API: **http://127.0.0.1:5000/api**. Administrator credentials are in the ignored `server/.env`; do not paste that file into logs or source control.

To reinstall from the recovered workspace cache:

```powershell
npm ci --offline --cache .npm-cache --ignore-scripts --no-audit --no-fund
```

Stop this application's Node/Vite processes before a clean reinstall on Windows so native modules are not held open. Do not stop unrelated processes or remove user data. A fresh clone does not contain the ignored cache: use `npm ci --cache .npm-cache` from a registry-enabled environment, with TLS verification enabled. Commit the provided lockfile; do not regenerate versions unnecessarily.

If the native database has stopped, run this in a separate terminal; the current workspace directory is already initialized and must not be reinitialized:

```powershell
& 'C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe' --dbpath "$PWD\.local-data\qa-mongo" --port 27018 --bind_ip 127.0.0.1 --replSet campusQa
```

For a fresh data directory, use the initial replica-set setup in the [QA audit](qa-audit.md). Docker/Atlas remain supported alternatives; configure `MONGODB_URI` consistently. Never reconfigure an unrelated MongoDB installation.

Run all requested checks:

```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:27018/?replicaSet=campusQa'
npm run test:rules
npm run test:client
npm run test:client:ui
npm run test:integration
npm run lint
npm run typecheck
npm run build
npm run check:release
```

For a first configured development install, explicitly run `npm run seed` for the six demo resources/admin or `npm run seed:admin` for only the administrator. Both preserve existing data and require unique development seed credentials. The seed was already executed successfully in this workspace; repeating it is not required.

## Remaining limits

- No dependency, build, lint, HTTP acceptance or release-gate blocker remains in this workspace.
- Outbound registry access is still denied by the offline environment. The recovered project cache enables verified reinstall here; uncached packages or a fresh clone need registry access or an appropriate verified cache.
- Docker's daemon is unavailable here; native MongoDB supplies the required replica set.
- Tests used a single-node replica set. Multi-node failover, production load, hosted deployment and a complete browser accessibility/security audit were not tested.
- Headless visual smoke attachment failed as described above; no visual QA result was fabricated.
- Existing React Router future-version warnings and package deprecation notices are non-failing. Optional calendar and approval features were not implemented.
