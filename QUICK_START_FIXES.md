# Quick Start: Critical Fixes for Load Testing

**Status:** 🔴 **CRITICAL - System failed load test with 20 users**

**Problem:** Database connection pool exhaustion causing 47.8% error rate and 7+ second response times

---

## TL;DR - Do This Now

### Required Before ANY Production Use

```bash
# 1. Reduce polling frequency (5 minutes)
# Edit: src/client/wsClient.ts line ~160
const POLL_INTERVAL = 1500; // Change from 750

# 2. Upgrade Supabase ($25/month)
# Go to: https://supabase.com/dashboard/project/_/settings/billing
# Click: Upgrade to Pro

# 3. Add database indexes (5 minutes)
# Go to: Supabase SQL Editor
# Run the SQL below
```

### Required SQL (Run in Supabase):

```sql
-- Speed up lot queries
CREATE INDEX IF NOT EXISTS idx_lot_event_status
  ON "Lot"("eventId", "status");

-- Speed up bid queries
CREATE INDEX IF NOT EXISTS idx_bid_lot_created
  ON "Bid"("lotId", "createdAt" DESC);

-- Speed up sale queries
CREATE INDEX IF NOT EXISTS idx_sale_event_finalized
  ON "Sale"("eventId", "finalizedAt" DESC);
```

### Recommended: Add Response Caching (1-2 hours)

Create: `src/lib/cache.ts`

```typescript
const stateCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 300; // 300ms

export function getCachedState<T>(
  key: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  const cached = stateCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return Promise.resolve(cached.data);
  }

  return fetchFn().then(data => {
    stateCache.set(key, { data, timestamp: Date.now() });

    // Clean old entries
    if (stateCache.size > 100) {
      const oldestKey = stateCache.keys().next().value;
      stateCache.delete(oldestKey);
    }

    return data;
  });
}
```

Update: `src/app/api/events/[eventId]/state/route.ts`

```typescript
import { getCachedState } from '@/lib/cache';

export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const data = await getCachedState(
    `event-state-${eventId}`,
    () => getAuctionState(eventId)
  );

  return NextResponse.json(data);
}
```

---

## Timeline

### TODAY (30 minutes)
1. ✅ Reduce polling to 1500ms
2. ✅ Add database indexes
3. ✅ Commit changes

### THIS WEEK (2-3 hours)
1. ✅ Implement response caching
2. ✅ Upgrade Supabase to Pro
3. ✅ Test with 10 users
4. ✅ Test with 20 users
5. ✅ Verify <5% error rate

### BEFORE PRODUCTION
1. ✅ Upgrade Vercel to Pro ($20/mo) - optional but recommended
2. ✅ Run full dress rehearsal
3. ✅ Monitor with dashboard during test

---

## Cost Breakdown

| Item | Cost | Required? |
|------|------|-----------|
| Supabase Pro | $25/month | ✅ YES |
| Vercel Pro | $20/month | ⚠️ Recommended |
| Domain | $13/year | Optional |
| **Total (Minimum)** | **$25/mo** | |
| **Total (Recommended)** | **$45/mo** | |

**Note:** You can cancel subscriptions after your event if needed.

---

## Test Results Summary

**Load Test:** 20 concurrent users, 30 second duration

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Error Rate | 47.8% | <5% | ❌ FAIL |
| Avg Response | 7,348ms | <1,000ms | ❌ FAIL |
| Max Response | 11,474ms | <2,000ms | ❌ FAIL |
| 429 Errors | 0 | 0 | ✅ PASS |

**Verdict:** System cannot handle 20 users without fixes

---

## After Fixes - Expected Results

| Metric | Expected | Status |
|--------|----------|--------|
| Error Rate | <3% | ✅ PASS |
| Avg Response | <800ms | ✅ PASS |
| Max Response | <1,500ms | ✅ PASS |
| User Capacity | 30-50 users | ✅ PASS |

---

## Quick Commands

### Run Load Test Again

```bash
node test-load.mjs
```

### Check Server Logs

```bash
tail -f /tmp/calcutta-dev.log | grep -i error
```

### Monitor Real-Time

```bash
npm run dev
# Open: http://localhost:3000
# Click the colored dot (bottom-right) to see metrics
```

---

## Questions?

See full analysis in: **LOAD_TEST_REPORT.md**

## Next Actions

1. ⏰ Reduce polling frequency (NOW - 5 minutes)
2. 🗄️ Add database indexes (NOW - 5 minutes)
3. 💳 Upgrade Supabase (TODAY - 5 minutes)
4. 💾 Implement caching (THIS WEEK - 2 hours)
5. 🧪 Re-run load test (AFTER FIXES)

---

**DO NOT run production event until load test passes with <5% errors!**
