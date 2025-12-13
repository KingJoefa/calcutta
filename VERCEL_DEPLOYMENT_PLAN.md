# Vercel Deployment Plan

## Overview
This document outlines the steps to deploy the Calcutta auction application to Vercel for production use.

## Key Challenge: WebSocket Server

**Problem**: The current WebSocket server runs on a separate HTTP server (port 4000), which won't work on Vercel's serverless architecture. Vercel serverless functions don't support persistent WebSocket connections.

**Solution Options** (choose one):

### Option 1: Server-Sent Events (SSE) - Recommended ✅
- **Pros**: Native Vercel support, simpler, no external services
- **Cons**: One-way communication (server → client), need to refactor
- **Effort**: Medium (refactor WebSocket to SSE)

### Option 2: External WebSocket Service
- **Services**: Pusher, Ably, or custom WebSocket server on Railway/Render
- **Pros**: Keep existing WebSocket code, real-time bidirectional
- **Cons**: Additional cost, external dependency
- **Effort**: Low (just change connection URL)

### Option 3: Separate WebSocket Server Deployment
- **Platforms**: Railway, Render, Fly.io, or DigitalOcean
- **Pros**: Full control, keep existing code
- **Cons**: Additional infrastructure to manage
- **Effort**: Low (deploy separately)

---

## ✅ IMPLEMENTED: Server-Sent Events (SSE) Solution

**Status**: SSE implementation is complete and ready for Vercel free tier deployment!

The code now automatically uses:
- **SSE (Server-Sent Events)** on Vercel/production (free tier compatible)
- **WebSocket** in local development (if `NEXT_PUBLIC_WS_PORT` is set)

No external services needed - works entirely on Vercel free tier!

---

## Deployment Steps

### Phase 1: Pre-Deployment Setup

#### 1.1 Database Setup
- ✅ **Current**: Using Supabase PostgreSQL (already configured)
- ✅ **Action**: Ensure `DATABASE_URL` is set in Vercel environment variables
- ✅ **Note**: Database is already production-ready

#### 1.2 Environment Variables
Set these in Vercel dashboard → Project Settings → Environment Variables:

```
DATABASE_URL=postgresql://... (your Supabase connection string)
NEXT_PUBLIC_WS_PORT=4000 (or remove if using SSE/external service)
```

#### 1.3 Build Configuration
- ✅ **Current**: Next.js 16 with App Router (Vercel-native)
- ✅ **Action**: No changes needed - Vercel auto-detects Next.js

---

### Phase 2: WebSocket Solution Implementation

#### Option A: Server-Sent Events (SSE) - Recommended

**Changes Needed**:

1. **Create SSE API Route** (`src/app/api/events/[eventId]/stream/route.ts`):
   ```typescript
   export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
     const { eventId } = await params;
     const stream = new ReadableStream({
       start(controller) {
         // Subscribe to events and stream to client
         // Use EventSource API on client side
       }
     });
     return new Response(stream, {
       headers: {
         'Content-Type': 'text/event-stream',
         'Cache-Control': 'no-cache',
         'Connection': 'keep-alive',
       },
     });
   }
   ```

2. **Update Client** (`src/client/wsClient.ts`):
   - Replace WebSocket with EventSource for SSE
   - Keep same interface for compatibility

3. **Update Broadcast Logic**:
   - Use in-memory event store or Redis for cross-function communication
   - Or use Vercel KV (Redis) for event distribution

**Pros**: Native Vercel support, no external services
**Cons**: One-way (server → client), need Redis for multi-instance

#### Option B: External WebSocket Service (Pusher/Ably)

**Changes Needed**:

1. **Install Pusher SDK**:
   ```bash
   npm install pusher pusher-js
   ```

2. **Update Server Broadcast** (`src/server/wsServer.ts`):
   ```typescript
   import Pusher from 'pusher';
   
   const pusher = new Pusher({
     appId: process.env.PUSHER_APP_ID!,
     key: process.env.PUSHER_KEY!,
     secret: process.env.PUSHER_SECRET!,
     cluster: process.env.PUSHER_CLUSTER!,
   });
   
   export function broadcast(eventId: string, type: string, payload: unknown) {
     pusher.trigger(`event-${eventId}`, type, { type, eventId, payload, ts: Date.now() });
   }
   ```

3. **Update Client** (`src/client/wsClient.ts`):
   ```typescript
   import Pusher from 'pusher-js';
   
   const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
     cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
   });
   
   const channel = pusher.subscribe(`event-${eventId}`);
   ```

**Cost**: ~$49/month for Pusher (or free tier for low usage)
**Pros**: Minimal code changes, reliable
**Cons**: External dependency, cost

#### Option C: Separate WebSocket Server (Railway/Render)

**Deployment Steps**:

1. **Create separate WebSocket server** (extract `src/server/wsServer.ts` to standalone app)
2. **Deploy to Railway/Render**:
   - Railway: Connect GitHub repo, set port 4000
   - Render: Create Web Service, set port 4000
3. **Update Environment Variables**:
   ```
   NEXT_PUBLIC_WS_URL=wss://your-ws-server.railway.app
   ```
4. **Update Client**: Change WebSocket URL to use `NEXT_PUBLIC_WS_URL`

**Cost**: ~$5-20/month (Railway/Render)
**Pros**: Keep existing code, full control
**Cons**: Additional infrastructure

---

### Phase 3: Vercel Deployment

#### 3.1 Connect Repository
1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your GitHub repository
4. Vercel auto-detects Next.js

#### 3.2 Configure Build Settings
- **Framework Preset**: Next.js (auto-detected)
- **Build Command**: `npm run build` (default)
- **Output Directory**: `.next` (default)
- **Install Command**: `npm install` (default)

#### 3.3 Set Environment Variables
In Vercel dashboard → Settings → Environment Variables:

```
DATABASE_URL=postgresql://... (from Supabase)
NEXT_PUBLIC_WS_PORT=4000 (if using separate server)
# OR if using Pusher:
PUSHER_APP_ID=...
PUSHER_KEY=...
PUSHER_SECRET=...
PUSHER_CLUSTER=...
NEXT_PUBLIC_PUSHER_KEY=...
NEXT_PUBLIC_PUSHER_CLUSTER=...
```

#### 3.4 Deploy
1. Click "Deploy"
2. Wait for build to complete
3. Get production URL: `https://your-project.vercel.app`

---

### Phase 4: Post-Deployment

#### 4.1 Custom Domain (Optional)
1. Vercel Dashboard → Settings → Domains
2. Add your domain (e.g., `auction.yourdomain.com`)
3. Configure DNS records as instructed

#### 4.2 Database Migrations
Run migrations on production database:
```bash
npx prisma migrate deploy
```

#### 4.3 Testing
- ✅ Test event creation
- ✅ Test real-time updates
- ✅ Test bidding flow
- ✅ Test timer functionality
- ✅ Test CSV export

---

## Recommended Implementation Order

### Quick Start (Minimal Changes)
1. **Deploy WebSocket server separately** (Railway/Render) - 30 min
2. **Deploy Next.js app to Vercel** - 15 min
3. **Set environment variables** - 5 min
4. **Test** - 10 min

**Total**: ~1 hour

### Long-term (Better Architecture)
1. **Refactor to Server-Sent Events** - 2-4 hours
2. **Add Redis/Vercel KV for event distribution** - 1 hour
3. **Deploy to Vercel** - 15 min
4. **Test** - 30 min

**Total**: ~4-6 hours

---

## Cost Estimate

### Vercel
- **Hobby Plan**: Free (good for testing)
- **Pro Plan**: $20/month (for production)

### Database (Supabase)
- **Free Tier**: Up to 500MB database
- **Pro Tier**: $25/month (if needed)

### WebSocket Service (if using external)
- **Pusher**: Free tier (200k messages/day) or $49/month
- **Railway/Render**: $5-20/month

**Total Monthly Cost**: $0-70/month depending on options

---

## Next Steps

1. **Choose WebSocket solution** (recommend Option C for quickest deployment)
2. **Set up separate WebSocket server** (if choosing Option C)
3. **Deploy to Vercel**
4. **Test thoroughly**
5. **Share production URL** with users

---

## Troubleshooting

### WebSocket Connection Failed
- Check `NEXT_PUBLIC_WS_URL` environment variable
- Verify WebSocket server is running
- Check CORS settings

### Database Connection Issues
- Verify `DATABASE_URL` is set correctly
- Check Supabase connection pooling settings
- Ensure database allows connections from Vercel IPs

### Build Failures
- Check Prisma client generation (`prisma generate` in build)
- Verify all environment variables are set
- Check Next.js build logs

---

## Additional Resources

- [Vercel Deployment Docs](https://vercel.com/docs)
- [Next.js on Vercel](https://nextjs.org/docs/deployment)
- [Railway Deployment](https://docs.railway.app)
- [Render Deployment](https://render.com/docs)

