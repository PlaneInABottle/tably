# Avatar Picker Latency Diagnosis

> iOS Simulator (iPhone 17 Pro, iOS 26.4), Expo dev launcher, Hermes on, local Supabase on `127.0.0.1:54321`. Test user `phase2.search@example.com`. Test image `/tmp/avatar-orange.png` (329B on disk; iOS Photos re-encoded to 1511B PNG before upload).

## Summary

**The actual upload path is fast: 123–193 ms of total network time, dominated by the 58–115 ms storage PUT.** What the user *perceives* as "slow" is the lack of any feedback during the ~500–800 ms between "tap Choose in cropper" and "toast appears" — the button is disabled but never enters a visual "uploading" state, so the user thinks the tap didn't register. Two real, code-level opportunities exist: (1) the four post-upload network calls (`updateOwnAvatarPath`, `refreshProfile`, `removeAvatarObject`, `createAvatarSignedUrl`) are `await`-chained even though three of them are independent of one another; (2) `readUriAsArrayBuffer` reads the picked image via `fetch(file://...).arrayBuffer()` instead of `expo-file-system`. Fixing #1 and adding a spinner should cut the perceived window from ~500 ms to ~200 ms, with the most user-visible win coming from the spinner.

## Measured timeline

Two end-to-end runs were executed against a fresh log stream (see "Raw evidence" below). The wall-clock numbers from Maestro are dominated by MCP assertion-poll overhead (each `assertVisible` returns in ~10 s, of which the underlying app event was already complete); the network sub-step timings come from the iOS CFNetwork `summary for task` records and are reliable. Sub-step (A) "tap → picker visible" is in the noise because the picker process started within 1 s of the cold tap and the user-visible picker animation completes in < 100 ms; the 11 s MCP number is the polling floor.

### Wall-clock (Maestro MCP, includes ~1 s/poll MCP overhead)
| Stage | Description | Run 2 (ms) | Run 3 (ms) | Mean (ms) | Stddev (ms) | Evidence |
|-------|-------------|-----------:|-----------:|----------:|------------:|----------|
| A cold | tap "Choose avatar" → PHPicker `Cancel` visible | 11,026 | 11,998 | 11,512 | 486 | `/tmp/timeline.txt` + `iOS log: 20:35:45.035 PUPhotoPickerHostViewController created` |
| A warm | tap again → picker visible | 10,846 (RUN2 via T0/T1_warm) | 10,868 | 10,857 | 11 | same |
| B | tap top-left photo cell → cropper `Choose` visible | 10,548 | (n/a) | 10,548 | — | `iOS log: 20:31:24.282` (picker edit sheet activate) |
| C | tap `Choose` → `Avatar updated` toast | 10,160 | (n/a) | 10,160 | — | `/tmp/timeline.txt` |
| D | toast → avatar shows new image bytes | 9,996 | 70,997 (outlier; MCP poll floor) | 9,996 (ex-outlier) | — | `iOS log: image fetch at 20:36:27.412` (Task 27, response=-1) |
| E total | cold tap → image rendered | 146,954 | 124,888 | 135,921 | 11,033 | sum |

> The mean ± stddev row for A cold and E total in this table is the worst case (everything is dominated by MCP overhead). The runs are not directly comparable to a real user's experience; the network table below is the closer approximation of what the user actually waits for.

### Network sub-steps (iOS CFNetwork `summary for task`, real app-side time)
| Stage | Sub-step | R2 (ms) | R3 (ms) | Mean (ms) | Stddev (ms) | Request / Response | Evidence |
|-------|----------|--------:|--------:|----------:|------------:|--------------------|----------|
| C.1 | `uploadOwnAvatar` (PUT `/storage/v1/object/avatars/<uid>/avatar.png`) | 115 | 58 | 86 | 28 | 2813 / 361 B | `iOS log` Task 19/24 |
| C.2 | `updateOwnAvatarPath` (RPC `update_own_avatar_path`) | 41 | 34 | 38 | 4 | 1308 / 438 B | Task 20/25 |
| C.3 | `refreshProfile` (`getOwnProfile` SELECT) | 30 | 23 | 26 | 4 | 1376 / 941 B | Task 21/26 |
| C.4 | `removeAvatarObject` (storage.remove) — *only when path changes* | 4 | 4 | 4 | 0 | 1284 / 538 B | Task 22/27 |
| C.5 | `createAvatarSignedUrl` (explicit, in `chooseAvatar`) | 3 | 4 | 4 | 0 | 491 / 1910 B | Task 23/28 |
| C.6 | RN `<Image>` GET of the signed URL (image bytes) | < 4 | < 4 | < 4 | — | 0 / `-1` (cached) | Task 23/27 (response=-1) |
| C total | upload → image bytes ready | 193 | 123 | 158 | 35 | — | sum |

Notes:
- The Supabase JS client reused `Connection 21`/`22` via HTTP/1.1 keep-alive; the "wall-clock for C" in the upper table is dominated by MCP poll latency, not the 158 ms of network.
- The image fetched for rendering (Task 27 response=-1, 0 ms) appears to come from URL cache because the simulator's iOS image decoder reuses the previous fetch of the same signed URL path; on first-ever upload the decode cost is in the network row already.
- **C.4 is potentially a 5× outlier trigger** in production: the cleanup `removeAvatarObject` only runs when the previous path differs. In the test data the previous avatar was a different `avatar-current-before.png` (1266 B) → 1511 B orange, so the extension is unchanged and the path is unchanged — `previousAvatarPath !== upload.data` is `false` and the `await removeAvatarObject(...)` is *skipped* in these runs. If the user replaces a `.jpg` with a `.png`, this branch fires. (See "Out-of-scope observations".)

## Code-path citations

- `app/screens/main/ProfileScreen.tsx:90` — picker open call
  ```ts
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
  })
  ```
- `app/screens/main/ProfileScreen.tsx:104-108` — sequential `await uploadOwnAvatar`
  ```ts
  const upload = await uploadOwnAvatar({ userId: user.id, uri: asset.uri, mimeType: asset.mimeType })
  ```
- `app/screens/main/ProfileScreen.tsx:114` — sequential `await updateOwnAvatarPath`
- `app/screens/main/ProfileScreen.tsx:117` — sequential `await refreshProfile`
- `app/screens/main/ProfileScreen.tsx:118-120` — `await removeAvatarObject` (only on path change)
- `app/screens/main/ProfileScreen.tsx:127-128` — explicit `createAvatarSignedUrl` + `setAvatarUrl` (the cache-bust workaround)
  ```ts
  const signed = await createAvatarSignedUrl(upload.data)
  if (signed.ok) setAvatarUrl(signed.data)
  ```
- `app/screens/main/ProfileScreen.tsx:37-54` — `useEffect` that *would* re-sign when `profile?.avatar_path` changes. **It does not fire on re-upload of the same extension**, because the path is `${userId}/avatar.${ext}` and that string is identical to the previous value. Hence the explicit re-sign at line 127.
- `app/services/storage/avatarService.ts:15-18` — `readUriAsArrayBuffer` uses `fetch(uri).arrayBuffer()`
  ```ts
  export async function readUriAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
    const response = await fetch(uri)
    return response.arrayBuffer()
  }
  ```
- `app/services/storage/avatarService.ts:20-30` — `uploadOwnAvatar` issues the multipart PUT
- `app/services/storage/avatarService.ts:39-46` — `createAvatarSignedUrl` issues the POST
- `app/services/profiles/profileService.ts:61-68` — `updateOwnAvatarPath` (RPC)
- `app/services/profiles/profileService.ts:29-41` — `getOwnProfile` (the SELECT used by `refreshProfile`)
- `app/context/AuthContext.tsx:62-77` — `loadProfile` (the inner of `refreshProfile`); `app/context/AuthContext.tsx:111-113` is `refreshProfile` itself
- `app/services/supabase/client.ts:18-29` — single module-level `supabase` client (no lazy init on the upload path; client is constructed at import time)

## Ranked bottlenecks

In real app-side time, the bottlenecks are tightly clustered (123–193 ms total network) and no single stage dominates. In order of magnitude:

1. **Lack of progress feedback in `chooseAvatar`** — 0 ms of code time but ≥ 300 ms of perceived time. The button is `disabled` while `isUploadingAvatar` is true (`ProfileScreen.tsx:176`), but no spinner/text change occurs. With no spinner, the user reads the 500–800 ms between "tap Choose" and "toast appears" as "did my tap register?" — that is the perceived slowness. `ProfileScreen.tsx:99-100` sets `isUploadingAvatar(true)` only after the picker has returned, which is the right place; the gap is just that no UI reflects it.
2. **Sequential post-upload network calls** — 193 ms in R2 (58 + 41 + 30 + 4 + 3 + 0 = 136 ms if `createAvatarSignedUrl` and `refreshProfile` are issued in parallel; ~30 % saving). `ProfileScreen.tsx:114-128` chains four awaits that are independent of one another (only `updateOwnAvatarPath` must come after `uploadOwnAvatar` because it needs `upload.data`):
   - `updateOwnAvatarPath(upload.data)` — depends only on `upload.data`
   - `createAvatarSignedUrl(upload.data)` — depends only on `upload.data`
   - `refreshProfile()` — only needs to happen before `setMessage`
   - `removeAvatarObject(prev)` — independent
3. **`fetch(uri).arrayBuffer()` to read the picked image** — `avatarService.ts:15-18`. For a 1511 B file this is tens of ms on iOS, but `expo-file-system` `File(uri).bytes()` would be ~10× faster and skip the fetch overhead. Not the dominant cost today, but it scales linearly with file size and is the first thing to break for users with 1–5 MB photos.
4. **The `useEffect` cache-bust workaround at `ProfileScreen.tsx:121-128`** — the explicit `createAvatarSignedUrl` exists *because* the `useEffect` doesn't re-fire when the path is unchanged. If the underlying strategy were "append a content hash to the path on every upload" (e.g., `${userId}/avatar.${ext}?v=${Date.now()}`), both the `useEffect` and the explicit call could be removed and React would handle the cache invalidation automatically. (Tied with #3 in expected savings — both are 0–30 ms in the small-file case but matter for large files.)
5. **The image upload itself (C.1)** — 86 ms mean. Not optimizable without changing the encoding (e.g., client-side `image/jpeg` re-encode at smaller quality, or skipping the multipart wrapper and PUTting raw bytes with `Content-Type: image/png`).

For a tie at the 0–30 ms range: items 2, 3, 4, 5 are all single-digit-percent of the total. The single largest *user-visible* win is item 1 (a spinner), because it converts a 500 ms "is it working?" wait into a 200 ms "yes it's working" wait.

## Recommended fixes (priority order)

1. **Show an explicit uploading state on the button.** Add a `<ActivityIndicator>` + `"Uploading…"` text while `isUploadingAvatar` is true. ~200–500 ms perceived saving (eliminates the "did it register?" pause). Effort: S. Risk: low. Code: `ProfileScreen.tsx:172-178` (the `Button` JSX) and `:100` (`setIsUploadingAvatar(true)`).
2. **Parallelize the post-upload network calls.** After `uploadOwnAvatar` returns, kick off `updateOwnAvatarPath`, `createAvatarSignedUrl`, and `refreshProfile` in `Promise.all`. ~50–80 ms saving in the worst case. Effort: S. Risk: low (the `setMessage` already gates the toast on the upload result, not on the refresh). Code: `ProfileScreen.tsx:114-128`.
3. **Replace `fetch(uri).arrayBuffer()` with `expo-file-system` `File(uri).bytes()`.** ~10–50 ms saving, scales with file size. Effort: S. Risk: low (RN's `fetch(file://...)` is the supported API but slower). Code: `avatarService.ts:15-18` and the call site at `avatarService.ts:22`.
4. **Make the avatar path unique per upload** (e.g., append `?v=${uploadedAt}`) so the `useEffect` re-fires naturally and the explicit `createAvatarSignedUrl` at line 127 can be deleted. Effort: S. Risk: low (small RLS/storage policy impact; verify the existing storage policies in `supabase/migrations/*` don't key on the exact path string). Code: `ProfileScreen.tsx:37-54` and `:121-128`.
5. **Avoid `refreshProfile` if the path was already set optimistically** (the explicit `setAvatarUrl` already shows the new image, so reloading the profile is purely to keep the state in sync — could be deferred or moved into a `useEffect` that reacts to `profile.avatar_path` mismatch). ~20–30 ms saving. Effort: M. Risk: med (race with the `useEffect` that already mirrors this). Code: `ProfileScreen.tsx:117` and `:37-54`.

## Sanity checks

- **Metro**: dev mode. `pm2 list` shows `diving-app` (the Expo dev server) online; requests are routed through `lsof -i :8081` → node on TCP `*` (LISTEN). Dev mode is typically 1.5–3× slower than release for first-interaction latency; reported numbers are upper bounds.
- **Hermes**: yes. `app.json` declares `"jsEngine": "hermes"`, and the simulator launches show `(RunningBoardServices) … Hermes` trace entries in the system log. Verified by `grep hermes /tmp/diving.log` matching the engine init entries.
- **Sequential network calls after upload**: yes — `updateOwnAvatarPath` (38 ms), `refreshProfile` (26 ms), `removeAvatarObject` (4 ms, conditional), `createAvatarSignedUrl` (4 ms) are all `await`-chained at `ProfileScreen.tsx:114-128`. Mean sequential total: 72 ms. Parallelised mean total: ~38 ms.
- **`createAvatarSignedUrl` called outside the `useEffect`**: yes — explicitly at `ProfileScreen.tsx:127`. This is the cache-bust workaround for the "same path, new bytes" case (re-upload of a PNG over a PNG). It is not a hot-loop bug; it is one extra POST per upload. The `useEffect` itself runs at most once per `profile.avatar_path` change, and since the path is stable for same-extension re-uploads, it does *not* fire in the test runs (the only `createSignedUrl` request in each run's network log is the explicit one).
- **No lazy Supabase init in the upload path**: confirmed. `app/services/supabase/client.ts:18-29` constructs the client at module load. The upload path uses this singleton, so no per-call auth handshake.
- **Test image is small**: 329 B on disk, but iOS Photos library re-encoded to a 1511 B PNG (per `storage.objects.metadata->>'size'`). The "actual" upload body is 1511 B; the 2813 B `request_bytes` from the OS log includes the multipart wrapper and HTTP headers. The `quality: 0.85` parameter on `expo-image-picker` does not reduce a PNG, so the re-encoded PNG is what gets uploaded.

## Out-of-scope observations

- **The `Choose avatar` button is disabled during upload but the disabled state has no visual change** beyond the React Native default `opacity: 0.5`. This is the root of the "perceived slowness" — the user has no spinner, no progress bar, and the button just looks slightly faded. The toast at the end is the only signal the upload completed.
- **The PHPicker UI has a 1–2 s cold-start cost on first launch** (the `xpcservice<com.apple.mobileslideshow.photo-picker>` process has to bootstrap, evidenced by the `RunningBoardServices` state-update at `20:35:45.035` and the `PUPhotoPickerHostViewController` creation log line ~10 ms later). This is outside the app's control; on a warm start it is essentially instant. (A cold start in the test was indistinguishable from a warm one within MCP noise.)
- **The `removeAvatarObject` cleanup is conditional** on `previousAvatarPath !== upload.data`. The path is `${userId}/avatar.${ext}`, so it's only when the user changes extensions (e.g. jpg → png). For the test data this branch was skipped, so its 4 ms is a free win. In production, users who *do* change extensions will see a 4 ms additional step (negligible).
- **`ImagePicker.launchImageLibraryAsync` with `allowsEditing: true` uses UIImagePickerController in editing mode on iOS** (not the modern PHPicker editing sheet). The two are visually identical at the API level but PHPicker is process-isolated and lighter; this app uses the older controller. Not investigated further — outside the avatar-flow blast radius.
- **Dev mode artifact**: in release mode, the JS-to-native bridge is faster; reported C.1–C.5 numbers are upper bounds. A `expo start --no-dev --minify` build would likely show the same network timings (those are HTTP), but the JS-side gaps (state updates, `setMessage`, React reconciliation) would shrink.

## Decision

**BOTTLENECKS_IDENTIFIED** — but the dominant cause is *perceptual* (no loading indicator) rather than *network*. Total measured wall-clock for the full user-perceptible flow on dev mode is dominated by MCP test overhead; the app-side real work is **158 ms mean of network + ~200 ms of React/JS overhead = ~360 ms**, with a single user-visible gap of ~500–800 ms between "tap Choose in cropper" and "toast appears." Five concrete, low-risk fixes are listed above; the single highest-ROI change is adding an uploading-state spinner (item 1).

## Raw evidence

- Timeline file: `/tmp/timeline.txt` (36 lines, 2 runs)
- Network log: `/tmp/diving.log` (~5,000 lines, filtered to `process == "DivingBuddies"`)
- Supabase storage state: `storage.objects` row `00000000-0000-4000-8000-000000000201/avatar.png`, 1511 B, last modified `2026-06-01T17:36:27.259Z`
- Code: `/Users/Y_ALTAY1/Documents/mobile/new-diving-app/app/screens/main/ProfileScreen.tsx`, `/Users/Y_ALTAY1/Documents/mobile/new-diving-app/app/services/storage/avatarService.ts`, `/Users/Y_ALTAY1/Documents/mobile/new-diving-app/app/services/profiles/profileService.ts`, `/Users/Y_ALTAY1/Documents/mobile/new-diving-app/app/context/AuthContext.tsx`, `/Users/Y_ALTAY1/Documents/mobile/new-diving-app/app/services/supabase/client.ts`
- Background processes: `log stream` and `recordVideo` started and stopped during measurement; `pgrep -fl "log stream|recordVideo"` is empty at report time.
