# smmart DeepWork — Project Notes & Handover

Living record of what has been built, decided and deployed, so anyone (or any AI agent) picking up
the project knows the current state. **Update this file when something important changes.**

Last updated: 2026-11-22

---

## 1. What the product is

**smmart DeepWork** is a desk device plus a web dashboard that runs and enforces "deep work"
sessions.

- **Device (ESP32-S3)**: 2.8" ILI9341 touchscreen, **LD2410C mmWave radar** (real presence
  detection, works even when sitting still), a separate **camera board** that streams JPEGs to the
  main ESP32 over SPI, an **I2S speaker** for the AI voice moderator, Wi-Fi.
- **Backend**: Node.js + TypeScript + Express + MongoDB (Mongoose).
- **Frontend**: React + TypeScript + Vite + Tailwind.

Core behaviour (all implemented):
- 2-hour Deep Work session with reverse countdown; extend prompts at 15 and 5 minutes before the end.
- Radar break tracking: away 5+ min = a break; 10 min = session "dying" (red screen, alarm, 30 s
  to return); more than 3 breaks (4 if over 3 h) = session invalid.
- 10 invalid sessions = 48-hour lockout.
- SDW points: +5 completed, +2 for 20+ min, 0 if invalid, -1 per away alert. Bloom Badge after
  5 completed sessions.
- Productivity score, Productivity Spike (45+ min with 1 break), 1–5 self-rating.
- AI voice moderator with personas (Athena, Marcus, Coach Rex, Aria) and intensity levels.
- Tasks with priority and deadlines; voice alert 30 min before a deadline; missed tasks tracked.
- Penalties: a missed task costs 1 hour of the user's time value; device unused 7 days → next
  2 days of sessions are 3 h.
- "Time currency": annual income → value per hour/minute, plus wasted-time cost.
- Roles: ADMIN, MANAGER, EMPLOYEE. Entrepreneur vs Individual mode.

---

## 2. Where things live

| Thing | Where |
|---|---|
| Code | GitHub `Sasukeeeeeee07/smmart_deep_work`, branch `main` |
| Backend hosting | Render, `https://backend-kwid.onrender.com` (health: `/api/health`) |
| Frontend hosting | Vercel (`frontend/vercel.json`) |
| Database | MongoDB Atlas, project **IOT**, cluster **Cluster0** (free tier, **backups OFF**), database **`test`** |
| Device id | `ESP32-S3-01` (hardcoded in firmware URLs) |

Repo layout:

```
backend/     Express API (src/), compiled output (dist/, see the gotcha in section 7)
frontend/    React dashboard
firmware/    SmartDesk_ESP32/SmartDesk_ESP32.ino (single Arduino sketch) + secrets files
docs/        this file, original implementation plan, overview deck
```

---

## 3. Work done (Nov 2026)

### 3.1 Face ID: only the assigned person can start a session

Decisions made with the owner:
- Recognition runs on the **backend** (not on the camera board; its firmware isn't in this repo).
- If the face doesn't match: **block session start** (strict).
- **Gestures** (e.g. wave to start/end): deferred to a later phase.

How it works:
- **Enrolment** (dashboard: Profile → *Set up Face ID*, or Team page → Face ID column): webcam
  takes 5 photos (or upload 3–8). Consent checkbox required. Server stores **only 128-number face
  templates** (`FaceProfile` model), **never photos**. Users can delete their own Face ID.
  Enrolment rejects: no face, more than one face, photos of different people.
- **Per-desk switch**: Devices page → *Require Face ID* (default OFF).
- **Device start**: on Start, the device grabs one camera frame (even off the Camera page), sends
  it to `POST /api/faces/device/:uid/verify`; backend answers MATCH / MISMATCH / NO_FACE /
  NOT_ENROLLED / ERROR; the photo is discarded. A match is valid for 2 minutes and is
  **single-use** (one match = one session start).
- **Web start**: `/start` returns `FACE_NOT_VERIFIED` and flags the device; the device sees
  `face.checkRequested` in its `/current` poll, takes the photo; the dashboard polls
  `GET /api/faces/device/:uid/check` (up to 30 s) and retries the start on a match.
- **Unrecognised person**: notification to leadership and the desk owner (max once per 10 min per
  desk) + voice announcement.
- **Engine**: `@vladmandic/face-api` on the pure-WASM TensorFlow.js backend (no native deps),
  JPEGs decoded with `jpeg-js`. Runs in a **separate child process** (`services/face/faceWorker`)
  that starts on demand and stops after 5 idle minutes; if it runs out of memory only it dies.
  Uses **~450–580 MB RAM while loaded** → Render needs a plan with **≥ 1 GB**.
- **Match threshold**: `FACE_MATCH_THRESHOLD`, default **0.45** (stricter than face-api's usual
  0.6). In testing two *different* people in one photo scored 0.525, so 0.5 was too loose.
- **Limits**: lightweight model, **no liveness check** (a photo of the employee could fool it).
  Treat it as a deterrent, not bank-grade security.

Main files: `backend/src/services/face/*`, `controllers/faceController.ts`,
`routes/faceRoutes.ts`, `models/FaceProfile.ts`, `models/Device.ts` (`faceVerification`),
the gate in `controllers/sessionController.ts` (`startSession`), the `face` field in
`getCurrentSession`; frontend `components/FaceEnrollModal.tsx`, `pages/Profile.tsx`,
`pages/Employees.tsx`, `pages/Devices.tsx`, `pages/DeepWork.tsx`; firmware `runFaceCheck()` and
the one-shot capture mode in `cameraTask`.

### 3.2 Security fixes

Problems found and fixed:

| Problem | Fix |
|---|---|
| `GET /api/auth/reset-admin` was **public** and reset the admin to `admin123` | Endpoint removed |
| `POST /api/auth/register-admin` let **anyone** create an admin | Works only once, on an empty database, 8+ char password |
| Login page showed demo admin/staff passwords and a "default password" tip | Removed |
| Server auto-created `admin@smmart.com` / `admin123` | First admin only from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env |
| JWT fell back to the public `super_secret_jwt_key` (tokens forgeable) | `config/jwt.ts`: never uses a known/short secret; falls back to a random one with a loud warning (everyone signed out on restart) |
| Managers could create Admins or reset Admin passwords | Only Admins can create/change/delete Admin & Manager accounts |
| New employees got `defaultpassword123` | Password required, 8+ characters |
| Atlas connection string with password hardcoded in two scripts | Scripts read `MONGODB_URI` from env; `testAdmin.ts` no longer prints hashes |
| Wi-Fi password hardcoded in firmware | Moved to `firmware/SmartDesk_ESP32/secrets.h` (gitignored); template `secrets.example.h` |
| `POST /api/voice/:uid/speak` was public (anyone could make a desk talk) | Needs a signed-in admin/manager/desk owner |

**The old credentials are still in git history.** They have been rotated (see section 5); the history
itself was not rewritten.

### 3.3 Device authentication

- Each desk can have a **secret key**. Admin generates it on the Devices page (*Generate key*,
  shown once, copy button); server stores only a SHA-256 hash (`Device.keyHash`, `select: false`,
  never returned by the API). `Device.keyCreatedAt` drives the *Secured / Not secured* label.
- Firmware sends it as header `X-Device-Key` on every backend request (`addDeviceKey()` after each
  `http.begin()`); value comes from `DEVICE_KEY` in `secrets.h`.
- `middleware/deviceAuth.ts` → `deviceAccess(mode)` on all `/:uid` device routes:

| Mode | Who may call | Endpoints |
|---|---|---|
| `read` | the device, or any signed-in user | `/sessions/:uid/current`, `lockout-status`, `sdwpoints`; `/devices/:uid`, `tasks`, `stats`, `display-config` (GET), `activity/latest` |
| `write` | the device, Admin/Manager, or the employee assigned to that desk | `/sessions/:uid/start`, `extend`, `stop-sound`, `resume`, `end`, `rate`, `command`, `alarm`; `/voice/:uid/speak` |
| `device` | the device only | `/sessions/:uid/break`, `break-counted`, `alarm-trigger`; `/devices/:uid/heartbeat`, `activity`; `/voice/:uid/next`; `/faces/device/:uid/verify` |

- An **unknown** device may register itself (heartbeat/activity) but gets nothing else until keyed.
- **Rollout mode**: a desk with no key keeps working as before (anonymous) until
  `REQUIRE_DEVICE_KEYS=true`. Once a desk has a key, keyless requests for it are refused.
- Controllers decide "request came from the device" via `req.deviceAuth` (set by the middleware),
  not via the spoofable `X-Device-Client` header.

### 3.4 Other

- Frontend API base URL can be overridden with `VITE_API_URL` (defaults to the Render URL).
- Pitch-deck content was reviewed against the code: the existing deck undersold the product (it
  missed the radar, deep-work sessions, voice moderator, points/penalties/lockout) and mentioned
  features that don't exist (meetings/calendar, notification preferences). Not code, just context.

---

## 4. Environment variables (backend, set on Render)

| Key | Purpose |
|---|---|
| `MONGODB_URI` | Atlas connection string (set on Render, never in code) |
| `JWT_SECRET` | 32+ random chars (`openssl rand -hex 32`). Missing/weak → random per restart |
| `REQUIRE_DEVICE_KEYS` | `false` during rollout; `true` once every desk is flashed with its key |
| `FACE_MATCH_THRESHOLD` | optional, default `0.45`; raise to `0.5` if real users are rejected |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | optional, only creates the first admin on an empty DB |
| `CORS_ORIGIN`, `NODE_ENV`, `PORT`, `DEVICE_OFFLINE_THRESHOLD_SECONDS` | existing |

Template: `.env.example` (no real values).

---

## 5. Deployment status (as of 2026-11-22)

Done:
- [x] Atlas password for the DB user rotated; `MONGODB_URI` on Render updated.
- [x] `JWT_SECRET` set on Render; `REQUIRE_DEVICE_KEYS=false` added.
- [x] PR `feat/face-id-and-security` merged into `main`; Render redeployed; health = connected;
      Devices page shows *Generate key*.
- [x] Old `admin@smmart.com` replaced by a new admin; other exposed account passwords changed;
      no unknown admin accounts found (3 users total at the time).

Pending (needs the physical device; do in one sitting):
- [ ] Change the Wi-Fi password, put it in `secrets.h`.
- [ ] Devices → *Generate key* for `ESP32-S3-01` → `DEVICE_KEY` in `secrets.h` → flash.
      **Don't generate the key before you can flash**: the current firmware would be locked out.
- [ ] Check the desk shows Online + Secured; start/end a session from the device and the web.
- [ ] Set `REQUIRE_DEVICE_KEYS=true` on Render.
- [ ] Upgrade Render to ≥ 1 GB RAM (needed for Face ID).
- [ ] Employees set up Face ID; turn on *Require Face ID*; **test on the real device**.
      Not yet verified on hardware: that the camera board hands over a frame outside the Camera
      page. If the screen says "Camera not ready", that's the part to investigate.

---

## 6. How it was tested

- Backend end-to-end scripts against a local backend + in-memory MongoDB: **36 Face ID checks**,
  **19 security checks**, **30 device-auth checks** (rollout + required mode), all passing on the
  compiled `dist/` build. (Scripts were throwaway, not committed.)
- Frontend: `tsc -b` + `vite build` pass; Devices/Team/Profile pages and the Face ID and device-key
  modals checked in a browser. Live webcam capture couldn't be tested (browser pane blocks the camera).
- Firmware: compiles for ESP32-S3 with PlatformIO (RAM ~20%, flash ~38%). **Not run on hardware.**

---

## 7. Gotchas for whoever works on this next

- **`backend/dist/` is committed but also listed in `.gitignore`.** After backend changes run
  `npm run build` in `backend/`, and **force-add any new compiled files** (`git add -f backend/dist/...`).
  Otherwise the committed `dist/` references files that aren't in git and the server crashes on start.
- **Firmware needs `firmware/SmartDesk_ESP32/secrets.h`** (copy `secrets.example.h`). It is
  gitignored; never commit it.
- **Never commit secrets.** Database URIs, passwords, keys go in Render env or `secrets.h`.
- Atlas free tier has **no backups**: be careful deleting documents.
- Face ID memory: if enrolment says "Face engine is unavailable", Render probably has < 1 GB RAM.
- Changing a desk's key locks out the old firmware until it is re-flashed.
- Pre-existing compiler warning: `DynamicJsonDocument` is deprecated (line ~3240 of the sketch).

---

## 8. Ideas / possible next steps

- Gestures via the camera (wave to start/end a session): the deferred phase 2 of Face ID.
- Re-check the face when someone returns from a break (currently only checked at session start).
- Liveness check for Face ID (blink/turn-head) to stop photo spoofing.
- Rewrite git history to purge the old credentials (requires force-push; affects all clones).
- Tasks completed from the device, and time tracked per task.
- Calendar/meeting integration (the old deck promised it; it doesn't exist).
