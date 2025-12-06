# Three-View Architecture Explanation

## Overview

The NFL Calcutta auction application uses a **three-view architecture** that separates concerns based on user roles and use cases. Each view serves a distinct purpose and has different levels of access and functionality.

---

## The Three Views

### 1. 🎮 Host Console (`/host/[eventId]`)

**Purpose**: Administrative setup and event management

**Who Uses It**: Event organizer/host (typically one person)

**When It's Used**: 
- Before the auction starts (setup phase)
- For administrative tasks during/after auction

**Key Features**:
- ✅ **Player Management**: View all registered players
- ✅ **Team Import**: Import NFL teams and trigger randomization
- ✅ **Basic Controls**: Simple lot opening/closing and bid placement (for testing)
- ✅ **Navigation Hub**: Links to Presenter and Audience views
- ✅ **Full Data Access**: Can see all event data (players, teams, lots, etc.)

**UI Design**:
- Simple, functional interface
- Light background, standard layout
- Focused on setup tasks

**Technical Details**:
- Server-side rendered (Next.js server component)
- Fetches full event data from database
- Can perform administrative actions
- WebSocket connected for real-time updates

**Limitations**:
- Not optimized for live auction control
- Basic controls (better controls available in Presenter view)

---

### 2. 📺 Presenter Dashboard (`/presenter/[eventId]`)

**Purpose**: Live auction control center

**Who Uses It**: Auctioneer/host running the live auction (typically one person)

**When It's Used**: 
- During the live auction
- Primary interface for auction management

**Key Features**:
- ✅ **Command Center Layout**: Dark theme, low-glare, optimized for screen sharing
- ✅ **Current Team Display**: Large, prominent display of team up for auction
- ✅ **Live Bid Amount**: Large green display showing current high bid
- ✅ **Countdown Timer**: Real-time countdown (blue → red when <10s)
- ✅ **Host-Only Controls**:
  - Open Lot (starts timer)
  - Pause/Resume Timer
  - Accept Bid & Advance (finalize sale)
  - Undo Last Sale
- ✅ **Activity Feed**: Right panel showing last 50 bids in real-time
- ✅ **Next Team Preview**: Shows upcoming team
- ✅ **Full Lot Management**: Can see all lots and their status

**UI Design**:
- **Dark theme** (#0a0a0a background) - reduces eye strain
- **Split layout**: Fixed left control panel (400px) + scrollable right feed
- **Large typography**: Optimized for screen sharing/projection
- **Color-coded elements**: Green for bids, blue/red for timer
- **Professional command center aesthetic**

**Technical Details**:
- Client-side component with WebSocket real-time updates
- Fetches initial state from `/api/events/[eventId]/state`
- Subscribes to WebSocket events: `bid_placed`, `lot_opened`, `lot_sold`
- Updates timer every 100ms for accuracy
- Can perform all host actions (open, sell, undo)

**Why Separate from Host Console?**:
- Different use case (live auction vs. setup)
- Optimized UI for live auction control
- Better UX for auctioneer during fast-paced bidding
- Activity feed provides audit trail

---

### 3. 👥 Audience View (`/audience/[eventId]`)

**Purpose**: Public-facing interface for participants to view and bid

**Who Uses It**: All auction participants/players (many people simultaneously)

**When It's Used**: 
- During the live auction
- Participants use this to see current status and place bids

**Key Features**:
- ✅ **Public Information Only**: 
  - Current team up for auction
  - Current high bid amount
  - High bidder name
  - Countdown timer
  - Next team preview
- ✅ **Bid Input**: 
  - Player selector dropdown
  - Bid amount input (with minimum validation)
  - Submit bid button
- ✅ **No Host Controls**: Cannot open lots, finalize sales, or undo
- ✅ **Read-Only Activity**: Can see current state but can't modify auction

**UI Design**:
- **Light theme** (#ffffff background) - clean and readable
- **Mobile-first responsive**: Works on phones, tablets, desktops
- **Large typography**: Easy to read from distance or on small screens
- **Simple, focused layout**: Primary auction card + secondary info
- **Minimal chrome**: No distracting elements
- **Clear visual hierarchy**: Most important info (team, bid, timer) is prominent

**Technical Details**:
- Client-side component with WebSocket real-time updates
- Fetches limited state (public data only)
- Subscribes to WebSocket events: `bid_placed`, `lot_opened`, `lot_sold`
- Can only perform one action: place bids
- Validates bids meet minimum increment requirement

**Why Separate View?**:
- Security: Participants can't accidentally modify auction
- UX: Simplified interface focused on bidding
- Mobile optimization: Works well on participant phones
- Public display: Can be shown on projector/screen

---

## How They Work Together

### Real-Time Synchronization

All three views connect to the same **WebSocket server** and receive real-time updates:

```
┌─────────────────┐
│  WebSocket      │
│  Server         │─── Broadcasts events to all connected clients
│  (Port 4000)    │
└─────────────────┘
         │
         ├───► Host Console (receives updates)
         ├───► Presenter Dashboard (receives updates)
         └───► Audience View (receives updates)
```

**WebSocket Events**:
- `bid_placed` - New bid submitted (updates all views)
- `lot_opened` - Lot opened for bidding (starts timer everywhere)
- `lot_sold` - Sale finalized (updates status everywhere)
- `undo_last` - Last sale undone (reverts state everywhere)

### Data Flow

```
1. Host Console: Import teams → Database updated → WebSocket broadcast
2. Presenter Dashboard: Open lot → Database updated → WebSocket broadcast
3. Audience View: Place bid → Database updated → WebSocket broadcast
4. Presenter Dashboard: Accept sale → Database updated → WebSocket broadcast
5. All views update in real-time via WebSocket
```

### Access Control

| Action | Host Console | Presenter Dashboard | Audience View |
|--------|-------------|---------------------|---------------|
| View players | ✅ | ✅ | ❌ |
| Import teams | ✅ | ❌ | ❌ |
| Open lot | ✅ | ✅ | ❌ |
| Place bid | ✅ | ✅ | ✅ |
| Accept sale | ✅ | ✅ | ❌ |
| Undo sale | ✅ | ✅ | ❌ |
| Pause timer | ❌ | ✅ | ❌ |
| View activity feed | ❌ | ✅ | ❌ |

---

## Design Rationale

### Why Three Separate Views?

1. **Separation of Concerns**
   - Setup (Host) vs. Live Control (Presenter) vs. Participation (Audience)
   - Each view optimized for its specific use case

2. **Security**
   - Audience can't accidentally break the auction
   - Host controls only available to authorized views

3. **User Experience**
   - Different users need different information
   - Presenter needs control center, Audience needs simplicity
   - Mobile optimization for Audience, desktop for Presenter

4. **Performance**
   - Audience view loads minimal data (faster)
   - Presenter view loads full state (needs everything)
   - Host console loads full event data (administrative)

5. **Scalability**
   - Many Audience views can connect simultaneously
   - Only one Presenter needed
   - Host Console used sparingly

### Why Not Just One View?

- **Too complex**: One view with all features would be overwhelming
- **Security risk**: Participants could accidentally modify auction
- **Poor UX**: Different users need different interfaces
- **Mobile issues**: Control-heavy interface doesn't work on phones

---

## Typical Workflow

### Before Auction
1. **Host Console**: Create event, add players, import teams
2. **Host Console**: Verify setup, check player list

### During Auction
1. **Presenter Dashboard**: Open on main screen/projector
2. **Audience View**: Share URL with all participants
3. **Presenter Dashboard**: Open first lot
4. **Audience View**: Participants place bids
5. **Presenter Dashboard**: Monitor activity feed, accept winning bid
6. **Repeat** for each team

### After Auction
1. **Host Console**: Export recap CSV
2. **Host Console**: Review final results

---

## Technical Implementation

### Shared Components
- `wsClient.ts` - WebSocket connection logic (used by all views)
- `prisma.ts` - Database client (used by server components)
- API routes - Shared backend logic

### View-Specific Components
- `HostControls.tsx` - Host Console controls
- `PresenterDashboard.tsx` - Presenter view component
- `AudienceView.tsx` - Audience view component
- `ImportAndRandomize.tsx` - Team import (Host only)

### State Management
- **Server State**: Fetched on page load (initial state)
- **Client State**: React hooks (UI state, timer, form inputs)
- **Real-Time State**: WebSocket updates (bid changes, lot status)

---

## Summary

The three-view architecture provides:

✅ **Clear separation** of setup, control, and participation  
✅ **Security** through access control  
✅ **Optimized UX** for each user type  
✅ **Real-time synchronization** via WebSocket  
✅ **Scalability** for many simultaneous participants  
✅ **Mobile support** for audience members  

Each view serves a specific purpose and together they create a complete auction management system.

