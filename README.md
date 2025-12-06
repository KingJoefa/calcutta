# NFL Calcutta Auction

A real-time NFL Calcutta auction web application built with Next.js 16, PostgreSQL, and WebSockets.

## Quick Start

1. **Setup environment**:
   ```bash
   bash setup-env.sh  # Creates .env file (update DATABASE_URL)
   ```

2. **Setup database**:
   ```bash
   npm run prisma:generate  # Generate Prisma client
   npx prisma db push        # Create database tables
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```

4. **Open**: [http://localhost:3000](http://localhost:3000)

## Project Status

📋 **See [PROJECT_STATUS.md](./PROJECT_STATUS.md) for detailed status, features, and updates.**

## Key Features

- ✅ Real-time auction management with WebSocket updates
- ✅ Separate views for Host, Presenter, and Audience
- ✅ Dark command center dashboard for presenters
- ✅ Clean, mobile-responsive audience view
- ✅ Team import and deterministic randomization
- ✅ Anti-snipe timer extensions
- ✅ Complete financial ledger and recap export

## Views

- **Home** (`/`) - Create new auction events
- **Host Console** (`/host/[eventId]`) - Manage auction, import teams
- **Presenter Dashboard** (`/presenter/[eventId]`) - Control center with timer and controls
- **Audience View** (`/audience/[eventId]`) - Public view for bidding

## Tech Stack

- Next.js 16.0.1 (App Router)
- PostgreSQL + Prisma ORM
- WebSocket (real-time updates)
- TypeScript

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
