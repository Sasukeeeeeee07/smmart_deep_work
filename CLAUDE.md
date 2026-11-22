# smmart DeepWork

Desk device (ESP32-S3: touchscreen, mmWave radar, camera, speaker) + Express/MongoDB backend +
React dashboard that runs and enforces "deep work" sessions.

**Read `docs/PROJECT_NOTES.md` first.** It records what has been built, the decisions made, the
deployment status, what is still pending and the known gotchas. Update it when something
important changes.

## Layout
- `backend/`: Node + TypeScript + Express + Mongoose. Source in `src/`, compiled to `dist/`.
- `frontend/`: React + Vite + Tailwind. API client in `src/services/api.ts`.
- `firmware/SmartDesk_ESP32/`: single Arduino sketch `SmartDesk_ESP32.ino`, plus `secrets.h`
  (local only, gitignored) and `secrets.example.h` (template).

## Commands
```bash
cd backend && npm install && npm run dev      # dev server (tsx watch)
cd backend && npx tsc --noEmit -p .           # type-check
cd backend && npm run build                   # compile to dist/ (do this after backend changes)
cd frontend && npm install && npm run dev     # dashboard; set VITE_API_URL to use a local backend
cd frontend && npx tsc -b && npx vite build   # type-check + production build
```

## Rules
- **Never commit secrets.** DB URIs, passwords, JWT secret and device keys live in Render env vars
  or `firmware/SmartDesk_ESP32/secrets.h`. Old credentials leaked in git history and were rotated.
- **`backend/dist/` is committed but gitignored**: after `npm run build`, force-add new compiled
  files (`git add -f backend/dist/...`) or the deployed server crashes on a missing module.
- Work on a branch and open a PR; don't commit straight to `main`.
- Device routes (`/:uid`) are guarded by `middleware/deviceAuth.ts` (`read` / `write` / `device`);
  new device endpoints must use it. Admin/Manager account changes are admin-only.
- Don't generate a device key (Devices page) unless the device can be re-flashed right away:
  the key locks out the old firmware.

## Production
- Backend: Render `https://backend-kwid.onrender.com` · Frontend: Vercel · DB: MongoDB Atlas
  project **IOT**, Cluster0, database `test` (free tier, no backups).
