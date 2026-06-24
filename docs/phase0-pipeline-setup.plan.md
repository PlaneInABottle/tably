# Phase 0 Pipeline Setup - Implementation Plan

## Problem Statement
Create a minimal, reproducible Phase 0 foundation in `/Users/Y_ALTAY1/Documents/mobile/new-diving-app` for an Ignite Expo app named `DivingBuddies`, local Supabase Docker/PostGIS, git tracking, and Maestro iOS launch smoke verification. This phase intentionally stops before product features, database schema design, app Supabase client wiring, or reference-app changes.

## Approach
Smallest viable setup: preserve the existing `docs/` plan, scaffold Ignite boilerplate into the existing project directory with explicit non-empty-target handling, initialize local-only Supabase, enable PostGIS only, add one Maestro launch/render smoke flow, and verify each boundary with CLI commands.

## Current State (Evidence)

| Evidence | Source | Status |
|---|---|---|
| Project directory currently contains `docs/` with this plan file. | `read /Users/Y_ALTAY1/Documents/mobile/new-diving-app` returned `docs/`; `read .../docs/phase0-pipeline-setup.plan.md` verified this file. | Verified |
| Project still has no `.git`, no source, no app config, and no generated scaffold before implementation. | `@explore` investigation plus current directory read; only `docs/` exists. | Verified |
| Reference app must remain read-only/untouched. | User scope + `@explore` confirmed `/Users/Y_ALTAY1/Documents/mobile/diving-buddy-master` inspected only as context | Verified |
| Required toolchain is available: Node v23.11.0, npm 10.9.2, yarn 1.22.22, Docker daemon, Xcode CLI/simulators, git 2.50.1, Ignite CLI 11.5.0 via npx, Supabase CLI 2.101.0, Maestro 2.5.1 at `$HOME/.maestro/bin/maestro`. | User-provided verified facts | Verified |
| Ignite supports `new [ProjectName]`, `--bundle`, `--git`, `--installDeps`, `--targetPath`, `--removeDemo`, `--yes`, and `--workflow`. | Context7 `/infinitered/ignite`, Ignite CLI docs | Verified |
| Maestro Expo dev-client flows may need to handle `DEVELOPMENT SERVERS`, `Continue`, and `Reload` overlays before asserting app content. | Loaded `maestro-testing` skill | Verified |
| Supabase local setup is via `supabase init`, `supabase start`, `supabase status`; verification should use native CLI/database tools. | Loaded `supabase` and `ai-native-workflow` skills | Verified |

## Verified Facts vs Assumptions

| Item | Type | Criticality | Evidence / Rationale | Owner to Recheck |
|---|---:|---:|---|---|
| Use existing project directory as root, currently non-empty only because `docs/phase0-pipeline-setup.plan.md` exists. | Fact | HIGH | User explicitly allowed this repo; current directory read verified only `docs/`. | @implementer before scaffold |
| Initialize git tracking in this project. | Fact | HIGH | User explicitly updated mission to include git. | @implementer |
| Do not modify `/Users/Y_ALTAY1/Documents/mobile/diving-buddy-master`. | Fact | HIGH | User scope-out explicitly forbids it. | @implementer + @analyzer |
| Scaffold app with Ignite, not vanilla Expo. | Fact | HIGH | User scope-in says “Scaffold Ignite Expo boilerplate only”. | @implementer |
| Ignite must handle the existing non-empty target safely. | Fact | HIGH | Plan file now makes target non-empty; use temp backup, `--overwrite`, and post-scaffold restore/validation. | @implementer + @analyzer |
| App display/project name is `DivingBuddies`. | Fact | HIGH | User objective names the app. | @implementer |
| Bundle identifier `com.divingbuddies.app`. | Assumption | LOW | Needed for iOS/Maestro `appId`; no user-provided bundle ID. Simple, reversible before distribution. | @analyzer review |
| Use Ignite CNG workflow unless Ignite default differs. | Assumption | LOW | Ignite docs expose `--workflow cng`; Expo local iOS generation fits smoke verification. If CLI rejects, fall back to `--yes` defaults and document result. | @implementer |
| Keep Ignite demo/minimal starter if required for first render, but remove demo only when CLI supports `--removeDemo` without breaking smoke assertion. | Assumption | MEDIUM | Scope says no feature screens/stores; `--removeDemo` is verified CLI option. Retained demo/example code is acceptable only as generated boilerplate, must not be edited/expanded, and must be documented in implementation notes. | @analyzer review |
| PostGIS extension can be enabled in Supabase `extensions` schema without creating product tables. | Assumption | LOW | Standard Postgres extension setup; verify via SQL query. | @implementer |

No CRITICAL or HIGH assumptions remain unverified.

## Success Criteria
- [ ] Repository has git tracking initialized in `/Users/Y_ALTAY1/Documents/mobile/new-diving-app` only.
- [ ] Ignite Expo boilerplate for `DivingBuddies` is generated and installs successfully.
- [ ] Local Supabase stack starts with Docker and reports service status.
- [ ] PostGIS extension is enabled and query-verifiable, with no feature schema/tables added.
- [ ] Maestro iOS smoke flow launches/renders the app and captures a screenshot.
- [ ] Reference app path is not modified.
- [ ] This plan file still exists after Ignite scaffolding, restored from backup if needed.

---

## Phase 1: Scaffold Ignite Expo App and Git Baseline
**Owner**: @implementer (React Native Expo setup)
**Dependencies**: None
**Complexity**: MEDIUM

### Tasks
- [ ] Reconfirm current working directory: `pwd` must print `/Users/Y_ALTAY1/Documents/mobile/new-diving-app`.
- [ ] Reconfirm non-empty target contents before generation: `ls -la /Users/Y_ALTAY1/Documents/mobile/new-diving-app` should show only `.`/`..` plus `docs/` containing this plan.
- [ ] Create a read-only before snapshot of the reference app for analyzer comparison; this is the only allowed command family that targets the reference path, and it must not write there:
  ```bash
  find /Users/Y_ALTAY1/Documents/mobile/diving-buddy-master -type f -exec shasum {} \; | sort > /tmp/diving-buddy-master.before.sha
  find /Users/Y_ALTAY1/Documents/mobile/diving-buddy-master -print | sort > /tmp/diving-buddy-master.before.paths
  ```
- [ ] Back up this plan outside the target before Ignite runs:
  ```bash
  mkdir -p /tmp/new-diving-app-phase0-plan-backup
  cp /Users/Y_ALTAY1/Documents/mobile/new-diving-app/docs/phase0-pipeline-setup.plan.md /tmp/new-diving-app-phase0-plan-backup/phase0-pipeline-setup.plan.md
  ```
- [ ] Initialize git if Ignite does not do it, or allow Ignite `--git` to initialize it in this directory only.
- [ ] Scaffold Ignite Expo boilerplate into the existing non-empty directory using explicit overwrite because only the backed-up `docs/` plan exists:
  ```bash
  npx ignite-cli@11.5.0 new DivingBuddies --yes --targetPath /Users/Y_ALTAY1/Documents/mobile/new-diving-app --overwrite --bundle com.divingbuddies.app --workflow cng --installDeps --git --removeDemo
  ```
- [ ] If `--removeDemo` or `--workflow cng` is rejected by Ignite 11.5.0, rerun once with the smallest supported fallback and record the exact fallback in implementation notes:
  ```bash
  npx ignite-cli@11.5.0 new DivingBuddies --yes --targetPath /Users/Y_ALTAY1/Documents/mobile/new-diving-app --overwrite --bundle com.divingbuddies.app --installDeps --git
  ```
- [ ] If fallback retains Ignite demo/example code, document that it is generated boilerplate only, not edited/expanded Phase 0 feature work.
- [ ] Post-scaffold, verify whether demo/example code exists and record the result for Maestro assertion selection:
  ```bash
  find /Users/Y_ALTAY1/Documents/mobile/new-diving-app -maxdepth 4 \( -iname '*demo*' -o -iname '*example*' \) -print | sort
  ```
- [ ] Verify generated app metadata and scripts without adding feature code.
- [ ] Validate the plan file still exists, restoring from backup if Ignite overwrote `docs/`:
  ```bash
  test -f /Users/Y_ALTAY1/Documents/mobile/new-diving-app/docs/phase0-pipeline-setup.plan.md || mkdir -p /Users/Y_ALTAY1/Documents/mobile/new-diving-app/docs
  test -f /Users/Y_ALTAY1/Documents/mobile/new-diving-app/docs/phase0-pipeline-setup.plan.md || cp /tmp/new-diving-app-phase0-plan-backup/phase0-pipeline-setup.plan.md /Users/Y_ALTAY1/Documents/mobile/new-diving-app/docs/phase0-pipeline-setup.plan.md
  test -f /Users/Y_ALTAY1/Documents/mobile/new-diving-app/docs/phase0-pipeline-setup.plan.md
  ```
- [ ] Create the after snapshot of the reference app and compare it to the before snapshot; any diff is a blocker:
  ```bash
  find /Users/Y_ALTAY1/Documents/mobile/diving-buddy-master -type f -exec shasum {} \; | sort > /tmp/diving-buddy-master.after.sha
  find /Users/Y_ALTAY1/Documents/mobile/diving-buddy-master -print | sort > /tmp/diving-buddy-master.after.paths
  diff -u /tmp/diving-buddy-master.before.sha /tmp/diving-buddy-master.after.sha
  diff -u /tmp/diving-buddy-master.before.paths /tmp/diving-buddy-master.after.paths
  ```

### Acceptance Criteria
- [ ] `git rev-parse --show-toplevel` prints `/Users/Y_ALTAY1/Documents/mobile/new-diving-app`.
- [ ] `git status --short` shows only new Phase 0 project files in this directory.
- [ ] `node -p "require('./package.json').name"` succeeds.
- [ ] `npm run --silent` or package script inspection shows iOS/start scripts available.
- [ ] `docs/phase0-pipeline-setup.plan.md` exists after scaffold, restored from `/tmp/new-diving-app-phase0-plan-backup/` if necessary.
- [ ] Before/after checksum and path snapshots show no files under `/Users/Y_ALTAY1/Documents/mobile/diving-buddy-master` changed.

### Validation Commands
```bash
pwd
git rev-parse --show-toplevel
git status --short
node -p "require('./package.json').name"
node -e "const p=require('./package.json'); console.log(Object.keys(p.scripts || {}).sort().join('\n'))"
test -f docs/phase0-pipeline-setup.plan.md
diff -u /tmp/diving-buddy-master.before.sha /tmp/diving-buddy-master.after.sha
diff -u /tmp/diving-buddy-master.before.paths /tmp/diving-buddy-master.after.paths
```

### Rollback / Cleanup
- If scaffold writes wrong location: stop immediately, remove only files created under `/Users/Y_ALTAY1/Documents/mobile/new-diving-app`, and do not touch sibling directories.
- If git root is wrong: remove `/Users/Y_ALTAY1/Documents/mobile/new-diving-app/.git` only after verifying `pwd` and `git rev-parse --show-toplevel`.
- If `docs/phase0-pipeline-setup.plan.md` is missing after scaffold: restore from `/tmp/new-diving-app-phase0-plan-backup/phase0-pipeline-setup.plan.md` before continuing.
- If dependency install fails: keep generated files, capture full npm/yarn error, and do not manually edit generated dependency graph until reviewed.

---

## Phase 2: Local Supabase Docker/PostGIS Setup
**Owner**: @implementer (Supabase local dev)
**Dependencies**: Phase 1
**Complexity**: LOW

### Tasks
- [ ] Initialize Supabase local config only:
  ```bash
  supabase init
  ```
- [ ] Start local Supabase Docker stack:
  ```bash
  supabase start
  supabase status
  ```
- [ ] Create a single migration to enable PostGIS without feature tables:
  ```bash
  supabase migration new enable_postgis
  ```
- [ ] Edit only the generated migration file under `supabase/migrations/*_enable_postgis.sql` with:
  ```sql
  create extension if not exists postgis with schema extensions;
  ```
- [ ] Apply/reset local database so migration is reproducible:
  ```bash
  supabase db reset
  ```
- [ ] Derive the local database URL from `supabase status`; use hard-coded `127.0.0.1:54322` only if the status output confirms it:
  ```bash
  DB_URL="$(supabase status | awk -F': ' '/DB URL/ {print $2; exit}')"
  test -n "$DB_URL"
  printf '%s\n' "$DB_URL"
  ```
- [ ] Verify extension exists via the derived local DB connection.
- [ ] Verify no forbidden app Supabase wiring was introduced after local backend setup.
  - If `rg` exits `2` because `app/` or `src/` do not exist in the generated Ignite layout, rerun the provided root-level command that excludes `node_modules/`, `supabase/`, and lockfiles; do not treat missing optional source directories as success without the root-level check.

### Acceptance Criteria
- [ ] `supabase/config.toml` exists and is local-only configuration.
- [ ] Exactly one Phase 0 migration exists for PostGIS; no product tables, RLS policies, seed data, functions, or app client code are added.
- [ ] SQL verification returns a PostGIS extension version.
- [ ] Searches for `@supabase/supabase-js`, `createClient(`, `supabaseUrl`, and `EXPO_PUBLIC_SUPABASE` in app source/config return no matches; lockfiles and `supabase/` local backend config are excluded from this app-wiring check.

### Validation Commands
```bash
supabase status
supabase migration list
DB_URL="$(supabase status | awk -F': ' '/DB URL/ {print $2; exit}')"
test -n "$DB_URL"
psql "$DB_URL" -tAc "select extname, extversion, nspname from pg_extension join pg_namespace on pg_extension.extnamespace = pg_namespace.oid where extname = 'postgis';"
psql "$DB_URL" -tAc "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE';"
! rg --glob '*.{ts,tsx,js,jsx,json,env,env.*}' --glob '!node_modules/**' --glob '!supabase/**' --glob '!package-lock.json' --glob '!yarn.lock' '@supabase/supabase-js|createClient\(|supabaseUrl|EXPO_PUBLIC_SUPABASE' .
node -e "const p=require('./package.json'); const deps={...(p.dependencies||{}),...(p.devDependencies||{})}; if (deps['@supabase/supabase-js']) { console.error('@supabase/supabase-js dependency present:', deps['@supabase/supabase-js']); process.exit(1) }"
```

### Rollback / Cleanup
- Stop local services without deleting config:
  ```bash
  supabase stop
  ```
- Full local cleanup if setup is wrong and no useful state exists:
  ```bash
  supabase stop --no-backup
  ```
- Remove only the generated `supabase/` directory if Phase 2 must be redone before any feature migrations exist.

---

## Phase 3: Maestro iOS Smoke Verification
**Owner**: @implementer (mobile E2E smoke)
**Dependencies**: Phase 1
**Complexity**: MEDIUM

### Tasks
- [ ] Add `.maestro/smoke-ios.yaml` only; keep selectors ASCII-only to avoid Maestro Turkish-character hangs.
- [ ] Use `appId: com.divingbuddies.app` unless Phase 1 generated a different bundle ID; if different, update the flow to match generated config.
- [ ] Include Expo dev-client overlay handling for `DEVELOPMENT SERVERS`, `Continue`, and `Reload` as optional/conditional flow steps.
- [ ] Boot one available iOS simulator.
- [ ] Start Expo/Metro via PM2 or a foreground terminal managed by the implementer; do not leave orphaned processes.
- [ ] Build/install or run the iOS app using generated Ignite scripts.
- [ ] Launch the app once and inspect actual generated UI with Maestro before writing the final assertion:
  ```bash
  maestro hierarchy > /tmp/divingbuddies-maestro-hierarchy.txt
  ```
- [ ] Select one stable generated ASCII label from `/tmp/divingbuddies-maestro-hierarchy.txt` for the final `extendedWaitUntil.visible` value. Do not use `.*`; do not add or edit app UI solely to satisfy the test.
- [ ] Run the final Maestro smoke test and capture screenshot.

### Candidate Flow Shape
```yaml
appId: com.divingbuddies.app
tags:
  - smoke
  - ios
---
- launchApp
- runFlow:
    when:
      visible: "DEVELOPMENT SERVERS"
    commands:
      - tapOn: "http://localhost:8081"
      - waitForAnimationToEnd
- runFlow:
    when:
      visible: "Continue"
    commands:
      - tapOn: "Continue"
      - waitForAnimationToEnd
- runFlow:
    when:
      visible: "Reload"
    commands:
      - tapOn: "Reload"
      - waitForAnimationToEnd
# Before committing this file, replace the next value with a real generated ASCII label
# observed in `maestro hierarchy`; examples depend on the generated Ignite screen.
- extendedWaitUntil:
    visible: "IGNITE_HIERARCHY_LABEL_TO_BE_REPLACED"
    timeout: 30000
- takeScreenshot: "phase0-ios-smoke"
```

Implementation note: the checked-in final `.maestro/smoke-ios.yaml` must replace `IGNITE_HIERARCHY_LABEL_TO_BE_REPLACED` with a real generated ASCII label observed in `maestro hierarchy`. A flow containing a wildcard assertion or the placeholder is not acceptable for final validation. If Ignite demo/example UI remains because fallback required it, asserting a generated demo label is acceptable only when implementation notes document that the demo code is unedited generated boilerplate.

### Acceptance Criteria
- [ ] `.maestro/smoke-ios.yaml` exists and contains only launch/render smoke steps.
- [ ] `.maestro/smoke-ios.yaml` contains no wildcard assertion and no `IGNITE_HIERARCHY_LABEL_TO_BE_REPLACED` placeholder.
- [ ] iOS simulator boots successfully.
- [ ] App launches and renders generated starter UI.
- [ ] Maestro smoke test exits 0 and writes a screenshot artifact.
- [ ] PM2/Metro/processes are cleaned up or explicitly listed as intentionally running.

### Validation Commands
```bash
export PATH="$HOME/.maestro/bin:$PATH"
maestro --version
xcrun simctl list devices available
# Pick one available simulator UDID, then:
xcrun simctl boot <UDID> || true
open -a Simulator
npm run ios -- --device <UDID>
maestro hierarchy
test -f .maestro/smoke-ios.yaml
! grep -E 'visible:[[:space:]]*["'\'']\.\*["'\'']' .maestro/smoke-ios.yaml
! grep -F 'IGNITE_HIERARCHY_LABEL_TO_BE_REPLACED' .maestro/smoke-ios.yaml
maestro test --device <UDID> .maestro/smoke-ios.yaml
```

### Rollback / Cleanup
```bash
pm2 list
pm2 delete DivingBuddies || true
xcrun simctl shutdown <UDID> || true
```
If the iOS build fails due to generated native files, preserve logs and do not edit native project internals without analyzer review.

---

## Deliverables

| Phase | Files Created/Modified |
|---|---|
| Planner | `docs/phase0-pipeline-setup.plan.md` |
| Phase 1 | Ignite-generated app files such as `package.json`, app config, source/assets, lockfile, `.gitignore`, `.git/` |
| Phase 2 | `supabase/config.toml`, `supabase/.gitignore`, `supabase/seed.sql`, `supabase/migrations/*_enable_postgis.sql` |
| Phase 3 | `.maestro/smoke-ios.yaml` |

## Blast Radius / Affected Entry Points
- Project root `/Users/Y_ALTAY1/Documents/mobile/new-diving-app` — all new generated app/config files live here.
- Temporary backup/snapshot files under `/tmp/new-diving-app-phase0-plan-backup/` and `/tmp/diving-buddy-master.*` — used only to preserve the plan and verify reference-app immutability.
- `.git/` — local repository tracking begins here only.
- `supabase/` — local Docker-backed Supabase configuration and PostGIS migration only.
- `.maestro/smoke-ios.yaml` — mobile smoke flow only.
- iOS Simulator + Docker + optional PM2 runtime — local developer machine state only.
- `/Users/Y_ALTAY1/Documents/mobile/diving-buddy-master` — read-only reference context; must not be modified.

## Allowed Scope / Forbidden Scope
- Allowed: Ignite scaffold, dependency lockfile, git initialization, local Supabase config/migration for PostGIS, one Maestro iOS smoke flow, docs plan preservation.
- Forbidden: Auth, maps, chat, push, Google Maps, feature screens, feature stores, database product tables/schema/RPCs/RLS policies, app Supabase client code, EAS/app-store setup, reference-app modifications.

## Invariants

| Invariant | Why it matters | How to verify |
|---|---|---|
| Git root is exactly `new-diving-app`. | Prevents accidental parent/sibling tracking. | `git rev-parse --show-toplevel` |
| Reference app remains untouched. | User explicitly forbade modifications. | Compare before/after `shasum` and path snapshots in `/tmp/diving-buddy-master.*`; use git status only if `.git` exists as extra evidence, not the primary check. |
| Phase 0 has no product DB tables. | Prevents schema decisions before feature planning. | `information_schema.tables` count/query for `public` product tables using DB URL derived from `supabase status`. |
| App does not contain Supabase client wiring. | Scope excludes app backend integration. | `! rg --glob '*.{ts,tsx,js,jsx,json,env,env.*}' --glob '!node_modules/**' --glob '!supabase/**' --glob '!package-lock.json' --glob '!yarn.lock' '@supabase/supabase-js|createClient\(|supabaseUrl|EXPO_PUBLIC_SUPABASE' .` plus dependency check. |
| Maestro selectors avoid Turkish special characters and wildcard assertions. | Known Maestro hang/false-positive risk. | Review `.maestro/smoke-ios.yaml`; grep checks for no wildcard `visible` assertion and no `IGNITE_HIERARCHY_LABEL_TO_BE_REPLACED`. |

## Behavior That Must Not Change
- `/Users/Y_ALTAY1/Documents/mobile/diving-buddy-master` remains unmodified and is not converted to git.
- No feature behavior is introduced; generated starter render remains the only app behavior under test.
- Supabase local stack remains local Docker-only; no remote `supabase link`, `db push`, secrets, or production project changes.
- No CI/CD or EAS release behavior is added in Phase 0.

## Legacy / Malformed State Handling
N/A for persisted app state: the target project has no generated app, database migrations, user data, or feature state. The directory is no longer empty because it contains this `docs/` plan; malformed-state handling is therefore limited to preserving/restoring the plan around Ignite `--overwrite`, detecting accidental reference-app changes with before/after snapshots, and using the phase rollback commands if partial scaffold/Supabase generation fails.

## Feature Flag Gating
N/A: Phase 0 introduces no user-facing feature or runtime feature branch. The only executable behavior is generated starter UI plus local smoke verification.

## Validation Matrix

| Check | Command / Method | Proves |
|---|---|---|
| Exact scaffold path | `git rev-parse --show-toplevel` | Git initialized in correct project only. |
| App metadata | `node -p "require('./package.json').name"` and generated app config inspection | Ignite scaffold exists for `DivingBuddies`. |
| Dependency/script availability | `node -e "const p=require('./package.json'); console.log(Object.keys(p.scripts||{}).sort().join('\n'))"` | App has runnable scripts. |
| Supabase local status | `supabase status` | Docker services are up and local URLs are available. |
| PostGIS enabled | `DB_URL="$(supabase status | awk -F': ' '/DB URL/ {print $2; exit}')" && psql "$DB_URL" -tAc "select extname, extversion, nspname from pg_extension join pg_namespace on pg_extension.extnamespace = pg_namespace.oid where extname = 'postgis';"` | Extension exists without app schema using status-derived DB URL. |
| No product tables | `DB_URL="$(supabase status | awk -F': ' '/DB URL/ {print $2; exit}')" && psql "$DB_URL" -tAc "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE';"` | Phase 0 did not add feature schema. |
| No Supabase app wiring | `! rg --glob '*.{ts,tsx,js,jsx,json,env,env.*}' --glob '!node_modules/**' --glob '!supabase/**' --glob '!package-lock.json' --glob '!yarn.lock' '@supabase/supabase-js|createClient\(|supabaseUrl|EXPO_PUBLIC_SUPABASE' .` and package dependency check | No app client integration was added. |
| Plan preservation | `test -f docs/phase0-pipeline-setup.plan.md` after scaffold | Ignite non-empty-target handling preserved the plan. |
| Reference-app immutability | `diff -u /tmp/diving-buddy-master.before.sha /tmp/diving-buddy-master.after.sha` and path diff | Reference app was not modified. |
| iOS smoke | `maestro hierarchy`, no wildcard/placeholder grep checks, then `maestro test --device <UDID> .maestro/smoke-ios.yaml` | App launches and renders on simulator using a real generated ASCII label. |
| Process cleanup | `pm2 list`, `supabase status`, `xcrun simctl list devices` | No unintended orphaned app processes; local infra state known. |

## Evidence Owners

| Item | Owner | Proof Required |
|---|---|---|
| Scaffold and git root | @implementer | Command output from git/package inspections. |
| No reference-app changes | @analyzer | Before/after checksum and path snapshot diffs. |
| Supabase/PostGIS local state | @implementer | `supabase status` and `psql` output. |
| No feature schema/client code | @analyzer | Status-derived `psql` checks plus forbidden wiring `rg` and package dependency checks. |
| Maestro smoke | @implementer | `maestro hierarchy` evidence for selected label, grep checks proving no wildcard/placeholder, `maestro test` exit 0 + screenshot path. |

## Failure Signals
- Ignite writes files outside `/Users/Y_ALTAY1/Documents/mobile/new-diving-app`.
- `git rev-parse --show-toplevel` points to `/Users/Y_ALTAY1/Documents/mobile` or another parent.
- `docs/phase0-pipeline-setup.plan.md` is missing after scaffold and cannot be restored from `/tmp/new-diving-app-phase0-plan-backup/`.
- Supabase migration creates product tables or app source imports `@supabase/supabase-js`.
- Supabase DB validation uses a hard-coded `54322` URL without first confirming it from `supabase status`.
- `.maestro/smoke-ios.yaml` contains a wildcard `visible` assertion or `IGNITE_HIERARCHY_LABEL_TO_BE_REPLACED` at final test time.
- Maestro flow requires adding feature UI solely for testability.
- Any command modifies `/Users/Y_ALTAY1/Documents/mobile/diving-buddy-master`.
- iOS build failure requires native-project edits beyond generated defaults.

## Review Gates

| Gate | After Phase | Focus Area |
|---|---|---|
| Gate 1 | Phase 1 | Correct root, generated Ignite-only app, git tracking scope, plan restored/preserved, reference-app snapshot unchanged, demo fallback documented. |
| Gate 2 | Phase 2 | Supabase local-only config, PostGIS migration only, status-derived DB URL, no feature schema/client/wiring. |
| Gate 3 | Phase 3 | Maestro smoke reliability, hierarchy-derived stable ASCII assertion, no wildcard selector, process cleanup. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| Ignite CLI rejects selected flags. | MEDIUM | MEDIUM | Use documented fallback command without optional flags; record exact command used. |
| Ignite scaffold overwrites existing `docs/` plan. | MEDIUM | HIGH | Copy plan to `/tmp/new-diving-app-phase0-plan-backup/` before scaffold, use `--overwrite` intentionally, verify `docs/phase0-pipeline-setup.plan.md` after scaffold, and restore from backup if missing. |
| Bundle ID mismatch breaks Maestro app launch. | MEDIUM | LOW | Inspect generated Expo/iOS config and update `.maestro/smoke-ios.yaml` to actual app ID. |
| Supabase Docker port conflict. | MEDIUM | MEDIUM | Run `supabase status`; if conflict, stop prior Supabase projects or adjust config only after review. |
| Maestro flake due to Expo dev overlays. | MEDIUM | LOW | Include conditional overlay dismissal and inspect `maestro hierarchy` on failure. |
| Orphaned Metro/PM2/iOS simulator process. | LOW | LOW | Use PM2 cleanup commands and simulator shutdown note. |

## Notes
- Keep edits small. For generated/config files, review one concern at a time; do not batch feature additions into scaffold fixes.
- Do not commit from planner. Implementer may commit only if explicitly instructed later.
- Context7 was used for Ignite CLI command/flag verification because CLI behavior affects scaffold correctness.
- No Context7 lookup was required for Supabase/Maestro basics because loaded skills and user-provided verified toolchain facts cover the planned behavior.

## Decision Log

| Decision | Chosen | Rejected | Rationale | Evidence |
|---|---|---|---|---|
| Scaffold tool | Ignite CLI | `create-expo-app` | User explicitly requested Ignite Expo boilerplate. | User scope-in; Context7 Ignite docs |
| Backend setup | Local Supabase Docker + PostGIS only | Remote Supabase link/schema/client | Scope excludes app Supabase code and feature schema. | User scope-in/out; Supabase skill |
| Mobile smoke | Maestro iOS launch/render | Full feature E2E | Phase 0 only needs generated app render verification. | User objective; Maestro skill |
| Reference app | Read-only context | Migration/modification | User forbids old app modifications. | User scope-out |
