# NFL Calcutta Auction - Operating Instructions

## Overview
This guide explains how to run an NFL Calcutta auction using the web application. The app provides two views: **Presenter Dashboard** (host/admin control center) and **Audience View** (public bidding).

---

## Setup & Preparation

### 1. Create a New Auction Event

**Location**: Home page (`/`)

1. **Enter Event Name**: e.g., "Super Bowl 2024 Calcutta"
2. **Configure Settings**:
   - **Ante**: Entry fee per player (default: $10.00)
   - **Minimum Increment**: Minimum bid increase (default: $1.00)
   - **Auction Timer**: Countdown duration in seconds (default: 30)
   - **Anti-Snipe Extension**: Additional time when bid placed near end (default: 10 seconds)
3. **Add Players**:
   - Enter one player per line in the textarea
   - Optional: Add @handle (e.g., "John @johnny")
   - If left blank, defaults to 4 demo players
4. **Click "Create Event"**
   - You'll be redirected to the Presenter Dashboard
   - Ante is automatically charged to all players

### 2. Import NFL Teams

**Location**: Presenter Dashboard (`/presenter/[eventId]`)

1. **If no teams exist, you'll see the "Import Teams" section automatically**
   - Otherwise, scroll to find the import section
2. **Enter team names** (one per line):
   ```
   Kansas City Chiefs
   Buffalo Bills
   Baltimore Ravens
   ...
   ```
   - Supports 14 teams (standard NFL playoff bracket)
   - Can include seed/region info: `Kansas City Chiefs (AFC #1)`
3. **Click "Import NFL Teams"**
   - Teams are automatically randomized into auction lots
   - **⚠️ IMPORTANT**: Do not click "Import" again after randomization
   - The order is deterministic based on the event's RNG seed

---

## Running the Auction

### 3. Use Presenter Dashboard

**Location**: `/presenter/[eventId]` (you're already here after creating the event)

The Presenter Dashboard provides:
- **Left Panel**: Current team, bid amount, timer, and host controls
- **Right Panel**: Real-time activity feed of all bids

### 4. Open Lot for Bidding

**On Presenter Dashboard**:
1. **Click "Open Lot"** button (left panel)
   - Timer starts automatically (default: 30 seconds)
   - Current team is displayed prominently
   - All connected clients see the team is open for bidding

### 5. Accept Bids

**Players can bid via two methods**:

#### Method A: Audience View (Recommended)
- **Location**: `/audience/[eventId]` (share this URL with players)
- Players select their name from dropdown
- Enter bid amount (must meet minimum increment)
- Click "Bid" button
- All views update in real-time

#### Method B: Presenter Dashboard
- Host can place bids on behalf of players from the Presenter Dashboard
- Select player from dropdown
- Enter bid amount (in cents) or use +$1, +$5, +$10 buttons
- Click "Bid" button

**Bid Rules**:
- Bid must be ≥ current bid + minimum increment
- Timer extends automatically if bid placed within anti-snipe window
- Highest bidder is displayed in real-time

### 6. Finalize Sale

**On Presenter Dashboard**:
1. **Verify winning bid** is displayed:
   - Team name
   - High bidder name
   - Bid amount
2. **Click "Accept Bid & Advance"** (red button)
   - Sale is recorded
   - Ledger entry created
   - Next team automatically becomes available
   - All views update to show team is sold

### 7. Repeat Process

**For each remaining team**:
1. Click "Open Lot" on Presenter Dashboard
2. Allow bidding (timer runs automatically)
3. Accept winning bid when timer expires or bidding stops
4. Repeat until all teams are sold

**Undo Last Sale** (if needed):
- Click "Undo Last Sale" button
- Last sale is reversed
- Team returns to "open" status
- Can be re-sold

---

## Standard Payout Structure

The app uses **additive payout percentages** based on playoff round wins:

| Round | Teams | % of Pot per Team | Total Round % |
|-------|-------|-------------------|---------------|
| **Wild Card (WC)** | 6 teams | 4% | 24% |
| **Divisional (DIV)** | 4 teams | 6% | 24% |
| **Conference (CONF)** | 2 teams | 12% | 24% |
| **Super Bowl (SB)** | 1 team | 28% | 28% |
| **Total** | | | **100%** |

**Note**: Percentages are additive. For example:
- Winning WC game = 4% of pot
- Winning WC + DIV games = 4% + 6% = 10% of pot
- Winning all rounds = 4% + 6% + 12% + 28% = 50% of pot

**Default Configuration** (set in event creation):
- Wild Card: 4%
- Divisional: 6%
- Conference: 12%
- Super Bowl: 28%

---

## Determining Payouts (Post-Auction)

### 8. Export Recap Data

**Location**: Presenter Dashboard or API endpoint

**Method**: Navigate to `/api/events/[eventId]/recap` or use Presenter Dashboard export feature

**CSV Export Contains**:
- Player name and handle
- NFL teams won
- Total spent (cents)
- Ante paid (cents)
- Net amount owed

### 9. Enter Playoff Results

**Note**: This feature is planned but not yet implemented in the UI. Currently, payout calculations are handled via the API.

**Future Implementation**:
- Use "Payouts" tab/view
- Mark each team's playoff results:
  - **W** = Win
  - **L** = Loss
  - **Blank** = Bye or no game
- System calculates payouts based on round allocations

### 10. Calculate Net Payouts

**Formula**:
```
Net Payout = (Winnings from teams) - (Total Spent) - (Ante)
```

**Example**:
- Player spent $50 on teams
- Player paid $10 ante
- Player's teams won: WC (4%) + DIV (6%) = 10% of $500 pot = $50
- Net Payout = $50 - $50 - $10 = -$10 (owes $10)

---

## View Descriptions

### Presenter Dashboard (`/presenter/[eventId]`)
- **Purpose**: Unified host/admin control center for running the auction
- **Features**:
  - Dark, low-glare interface
  - Large display of current team and bid
  - Countdown timer with visual warnings
  - Host-only controls (Open, Pause/Resume, Accept & Advance, Undo)
  - Real-time activity feed
  - Team import and randomization (when no teams exist)
  - Player list display
  - Full auction management capabilities
- **Use**: Primary interface for auctioneer/host - handles setup, team import, and live auction control

### Audience View (`/audience/[eventId]`)
- **Purpose**: Public-facing interface for players to bid
- **Features**:
  - Clean, readable layout
  - Large typography for screen sharing
  - Current team and high bid display
  - Countdown timer
  - Simple bid input form
  - Mobile-responsive
- **Use**: Share URL with all participants for bidding

---

## Tips & Best Practices

1. **Before Starting**:
   - Test both views to ensure WebSocket connection works
   - Verify all players are listed correctly
   - Confirm ante amount is appropriate
   - Import teams using the Presenter Dashboard

2. **During Auction**:
   - Keep Presenter Dashboard on main screen/projector
   - Share Audience View URL with all participants
   - Monitor activity feed for bid disputes

3. **Timer Management**:
   - Timer starts automatically when lot opens
   - Extends automatically on bids within anti-snipe window
   - Pause/Resume available on Presenter Dashboard (UI only, not persisted)
   - Host must manually accept bid when timer expires

4. **Error Handling**:
   - If bid fails, check minimum increment requirement
   - If timer doesn't update, refresh page (WebSocket reconnection)
   - Use "Undo Last Sale" if wrong bid accepted

5. **After Auction**:
   - Export recap CSV for record keeping
   - Verify all teams were sold
   - Calculate payouts based on playoff results (manual or via future feature)

---

## Troubleshooting

**Issue**: Teams not randomizing
- **Solution**: Ensure you clicked "Import NFL Teams" only once

**Issue**: Bids not appearing in real-time
- **Solution**: Check WebSocket connection, refresh page if needed

**Issue**: Timer not counting down
- **Solution**: Verify lot status is "open", refresh page

**Issue**: Can't place bid
- **Solution**: Check bid meets minimum increment (current bid + min increment)

**Issue**: Wrong bid accepted
- **Solution**: Use "Undo Last Sale" button immediately

---

## Quick Reference

| Action | Location | Button/Control |
|--------|----------|---------------|
| Create Event | Home (`/`) | "Create Event" |
| Import Teams | Presenter Dashboard | "Import NFL Teams" |
| Open Lot | Presenter Dashboard | "Open Lot" |
| Place Bid | Audience View | "Bid" button |
| Accept Sale | Presenter Dashboard | "Accept Bid & Advance" |
| Undo Sale | Presenter Dashboard | "Undo Last Sale" |
| Export Recap | API/Dashboard | `/api/events/[eventId]/recap` |

---

**Last Updated**: Current session
**App Version**: Next.js 16.0.1


