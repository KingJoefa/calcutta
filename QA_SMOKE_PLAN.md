# QA Smoke Lead Plan (Vercel Free Tier, SSE)

## Goals
- Validate the SSE-based real-time path (no WebSockets) end-to-end on Vercel Hobby.
- Catch regressions in bidding/timer flows and invitation security before release.
- Keep runtime within Vercel free-tier limits (60s functions, single-region DB).

## Preconditions
- Env vars on Vercel: `DATABASE_URL` set, `NEXT_PUBLIC_WS_PORT` **unset** (forces SSE).
- Seed data locally: `npm install`, `npx prisma generate`, `npm run db:seed` (or create one event manually).
- Use two browsers/devices: Host view and Audience view for real-time validation.
- Optional: set `PLAYER_TOKEN_SECRET` (or `NEXTAUTH_SECRET`) for predictable invite tokens.

## Smoke Checklist (run in order)
- **Transport health**
  - GET `/api/events/{eventId}/stream` stays open >60s locally; verifies keepalives and `since` replay after page refresh.
  - Bids/pauses emit SSE messages (inspect Network → EventStream) without console errors.
- **Host controls**
  - Open next lot → Audience instantly shows lot change and resets timer.
  - Pause/resume: timer freezes/unfreezes, pause duration accumulates, timer extend-on-resume when expired.
- **Bidding**
  - Valid bid increments by min increment; Audience high bid updates in real time and animates.
  - Reject bid below min increment with friendly error; timer at 0 blocks audience bids.
  - Anti-snipe: bid inside window extends closesAt and is reflected on Audience.
- **Invite security**
  - `/api/events/{eventId}/player-links` returns signed tokens per player.
  - Visiting `?player={id}&token={token}` locks bidder name and allows bids.
  - Tampered/short token returns `ok: false` and UI shows “Invite link invalid”; bid request is rejected (403).
- **Resilience**
  - Kill/restart Audience tab: reconnects to SSE, replays missed events via `since` param, UI state matches host.
  - Toggle offline/online in DevTools: status shows reconnecting → connected; no duplicate bids on replay.
- **Closing flow**
  - Mark lot sold → Audience clears bid input and starts 30s refresh countdown; host can open next lot without waiting.
- **Results/exports**
  - Host Results page loads with owners/top sales; CSV export (if present) succeeds.

## Quick Regression Script (local)
1) `npm test` (Vitest unit suite).  
2) `npm run lint` (optional if time allows).  
3) Manual steps above against `npm run dev` with `NEXT_PUBLIC_WS_PORT` unset to mirror Vercel.

## Known Risk to Watch
- SSE broadcaster uses in-memory listeners; Vercel serverless isolates routes, so events may not cross instances if functions scale. Mitigate by validating on a Vercel preview build and watching for missed events; long-term fix would use a shared channel (e.g., Redis/Vercel KV or a single long-lived server process).

## Exit Criteria
- All checklist items pass on a Vercel preview deployment using SSE.
- No unhandled console errors; EventStream stays connected/reconnects within 30s.
- Unit tests green; no critical bugs open.
