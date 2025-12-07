# NFL Calcutta Auction - Project Status Digest

## Overview
A real-time NFL Calcutta auction web application built with Next.js 16, PostgreSQL, Prisma, and WebSockets. The system enables live auction management with two views: Presenter Dashboard (host/admin control) and Audience View (public bidding).

---

## Recent Updates (Latest Session)

### ✅ Database Setup
- **Fixed**: Database tables now properly created via `prisma db push`
- **Status**: All Prisma models synced with PostgreSQL database
- **Models**: Event, Player, Team, Lot, Bid, Sale, LedgerEntry, RuleSet, Snapshot, AuditLog

### ✅ Next.js 16 Compatibility
- **Fixed**: Updated all dynamic route handlers to await `params` (Next.js 16 requirement)
- **Fixed**: Separated client components from server components
- **Status**: All pages and API routes compatible with Next.js 16

### ✅ UI Redesign - Presenter Dashboard
- **New**: Dark, low-glare command center layout (unified host/admin view)
- **Features**:
  - Fixed left control panel (400px) with current team, bid amount, timer, and host controls
  - Right-side real-time activity feed showing bid history
  - Large, legible typography optimized for screen sharing
  - Timer countdown with visual warnings (<10s turns red)
  - Host-only controls: Open Lot, Pause/Resume Timer, Accept Bid & Advance, Undo Last Sale
  - Team import and randomization functionality (merged from Host Console)
- **Status**: Fully functional with WebSocket real-time updates

### ✅ UI Redesign - Audience View
- **New**: Clean, mobile-first responsive layout
- **Features**:
  - Large typography for screen-share clarity
  - Primary auction card with current team, high bid, timer, and bid input
  - Secondary info cards (collapsible on mobile)
  - Simple player selector and bid amount input
  - Real-time updates via WebSocket
- **Status**: Fully functional, optimized for public display

### ✅ Real-Time Communication
- **WebSocket Server**: Running on port 4000 (configurable via `NEXT_PUBLIC_WS_PORT`)
- **Broadcast Events**: `bid_placed`, `lot_opened`, `lot_sold`, `undo_last`
- **Status**: Real-time updates working across all views

---

## Current Working Features

### 🏠 Home Page (`/`)
- **Status**: ✅ Working
- **Features**:
  - Event creation form with validation
  - Player management (name + optional @handle)
  - RuleSet configuration (ante, min increment, timer, anti-snipe extension)
  - Default demo players if none provided
  - Redirects to Presenter Dashboard after creation

### 📺 Presenter Dashboard (`/presenter/[eventId]`)
- **Status**: ✅ Working (Unified Host/Admin View)
- **Features**:
  - Dark command center interface
  - Current team display with seed/region info
  - Live bid amount (large green display)
  - Countdown timer (blue → red when <10s)
  - Host controls (Open, Pause/Resume, Accept & Advance, Undo)
  - Real-time activity feed (last 50 bids)
  - Next team preview
  - Team import and randomization (when no teams exist)
  - Player list display
  - Full auction management capabilities

### 👥 Audience View (`/audience/[eventId]`)
- **Status**: ✅ Working (Recently Redesigned)
- **Features**:
  - Clean, readable public interface
  - Current team and high bid display
  - Countdown timer
  - Player selector dropdown
  - Bid amount input with minimum validation
  - Real-time updates
  - Mobile-responsive layout

---

## API Endpoints

### Events
- `POST /api/events` - Create new auction event
- `GET /api/events/[eventId]/state` - Get current auction state (NEW)
- `POST /api/events/[eventId]/import-teams` - Import teams and auto-randomize
- `POST /api/events/[eventId]/randomize` - Randomize team order
- `POST /api/events/[eventId]/undo` - Undo last sale
- `GET /api/events/[eventId]/recap` - Export CSV recap

### Lots
- `POST /api/lots/[lotId]/open` - Open lot for bidding
- `POST /api/lots/[lotId]/bid` - Place a bid (with anti-snipe extension)
- `POST /api/lots/[lotId]/sell` - Finalize sale

### WebSocket
- `GET /api/ws` - Initialize WebSocket server
- WebSocket endpoint: `ws://localhost:4000/?eventId={eventId}`

---

## Core Functionality

### ✅ Auction Flow
1. **Event Creation**: Host creates event with players and rules
2. **Team Import**: Host imports NFL teams (supports seed, region, bracket)
3. **Randomization**: Teams randomized into auction lots using deterministic RNG
4. **Lot Opening**: Host opens lot, timer starts
5. **Bidding**: Players submit bids via Audience view or Presenter Dashboard
6. **Anti-Snipe**: Timer extends when bid placed near end (configurable)
7. **Sale Finalization**: Host accepts bid and advances to next team
8. **Undo**: Host can undo last sale if needed

### ✅ Financial Tracking
- **Ante Collection**: Automatic ante charges on event creation
- **Ledger System**: Complete transaction history (ante, sale, refund, adjustment, reversal)
- **Sale Tracking**: All sales recorded with player, amount, timestamp
- **Recap Export**: CSV export with player spending and team allocations

### ✅ Real-Time Features
- **WebSocket Updates**: All views update in real-time
- **Bid Broadcasting**: New bids instantly visible to all connected clients
- **Timer Sync**: Countdown timers synchronized across views
- **Status Changes**: Lot status changes (open/sold) broadcast immediately

---

## Technical Stack

- **Framework**: Next.js 16.0.1 (App Router)
- **Database**: PostgreSQL (via Prisma ORM)
- **Real-Time**: WebSocket (ws library)
- **Styling**: Inline styles (CSS-in-JS approach)
- **Type Safety**: TypeScript throughout
- **State Management**: React hooks + WebSocket subscriptions

---

## Configuration

### Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `NEXT_PUBLIC_WS_PORT` - WebSocket server port (default: 4000)

### Database Setup
```bash
npm run prisma:generate  # Generate Prisma client
npx prisma db push       # Sync schema to database
npm run db:seed          # Seed demo data (optional)
```

---

## Known Limitations & Future Enhancements

### Current Limitations
- Timer pause/resume UI exists but doesn't persist to database (UI-only state)
- No automatic lot closing when timer reaches zero (manual host action required)
- No player authentication (anyone can bid as any player)
- WebSocket reconnection not implemented (refresh page if connection lost)

### Potential Enhancements
- [ ] Automatic lot closing on timer expiration
- [ ] Player authentication/login system
- [ ] WebSocket reconnection logic
- [ ] Timer pause/resume persistence
- [ ] Mobile app or PWA support
- [ ] Payment integration for ante collection
- [ ] Advanced analytics and reporting
- [ ] Multi-event management dashboard

---

## Testing Status

- ✅ Event creation flow
- ✅ Team import and randomization
- ✅ Bid placement and validation
- ✅ Real-time WebSocket updates
- ✅ Timer countdown display
- ✅ Sale finalization
- ✅ Undo functionality
- ⚠️ Timer pause/resume (UI only, not persisted)
- ⚠️ Automatic timer expiration (manual only)

---

## Deployment Notes

- Requires PostgreSQL database (Supabase/local Postgres)
- WebSocket server runs on separate port (4000 by default)
- Ensure `DATABASE_URL` is set in production environment
- WebSocket server must be accessible from client browsers
- Consider using Vercel or similar platform with WebSocket support

---

**Last Updated**: Current session
**Status**: Core functionality working, UI redesigned, ready for testing


