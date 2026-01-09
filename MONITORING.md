# Performance Monitoring Guide

## Overview

The Calcutta app includes built-in performance monitoring to help you track API performance, identify bottlenecks, and determine if you need to upgrade from Vercel's free tier.

## Accessing the Monitor

When you open the **Presenter Dashboard** (`/presenter/[eventId]`), you'll see a colored dot in the bottom-right corner:

- 🟢 **Green**: System healthy (< 5% errors, < 1.5s avg response)
- 🟡 **Yellow**: Warning (5-10% errors or 1.5-3s avg response)
- 🔴 **Red**: Poor performance (> 10% errors or > 3s avg response)

Click the dot to open the full monitoring dashboard.

## Dashboard Features

### Key Metrics

1. **Average Response Time**: How long API calls take on average
   - **Good**: < 1000ms
   - **Warning**: 1000-2000ms
   - **Poor**: > 2000ms

2. **Error Rate**: Percentage of failed API calls
   - **Good**: < 5%
   - **Warning**: 5-10%
   - **Critical**: > 10%

3. **Total Calls**: Number of API requests made during this session

4. **Slow Calls**: Requests that took > 2 seconds

### Recent Activity

- **Recent Errors**: Last 5 errors with messages and context
- **Recent API Calls**: Last 10 API calls with response times

### Actions

- **Export Data**: Download full monitoring data as JSON for analysis
- **Clear Data**: Reset all metrics (useful for fresh testing)
- **Pause/Play**: Pause auto-refresh to inspect specific metrics

## What to Monitor During Testing

### Small Test (10-15 Users)

Watch for:
- Average response time staying < 1000ms
- Error rate staying < 5%
- No "429 Rate Limit" errors

**If you see issues**: Free tier might struggle with more users.

### Medium Test (15-30 Users)

Watch for:
- Average response time < 1500ms
- Error rate < 5%
- Slow call rate < 20%

**If you see issues**: Upgrade to Vercel Pro recommended ($20/month).

### Large Test (30+ Users)

Watch for:
- Frequent 429 errors (rate limiting)
- Average response time > 2000ms
- Error rate > 10%

**If you see issues**: Vercel Pro required, consider optimizing polling.

## Common Issues

### High Response Times (> 2000ms)

**Causes:**
- Database connection pool exhaustion
- Vercel serverless cold starts
- Too many concurrent requests

**Solutions:**
1. Check database connection in `.env` (should NOT have `connection_limit=1`)
2. Upgrade to Vercel Pro for better cold start performance
3. Reduce polling frequency in `wsClient.ts`

### 429 Rate Limit Errors

**Cause:** Hitting Vercel free tier concurrent execution limit (~10-20 executions)

**Solution:** Upgrade to Vercel Pro (100 concurrent executions)

### High Error Rate

**Causes:**
- Network issues
- API bugs
- Database timeouts

**Solutions:**
1. Check browser console for specific errors
2. Export monitoring data and review error messages
3. Check Vercel logs in dashboard

## Performance Optimization Tips

### If Staying on Free Tier

1. **Reduce polling frequency** in `src/client/wsClient.ts`:
   ```typescript
   const POLL_INTERVAL = 1500; // Change from 750 to 1500ms
   ```

2. **Limit concurrent events**: Only test 1-2 events per month

3. **Monitor bandwidth**: Check Vercel dashboard (100 GB/month limit)

### If Upgrading to Pro

- No changes needed
- Monitor for 100+ concurrent users (may need Supabase upgrade)
- Consider WebSocket implementation for very large events (50+ users)

## Exporting Data for Analysis

Click **Export Data** to download a JSON file with:
- All API call metrics (duration, status, endpoint)
- All error logs
- Aggregated statistics
- Timestamp

Use this data to:
- Identify slow endpoints
- Track performance over time
- Share with support if issues arise
- Decide on tier upgrades

## When to Upgrade

**Upgrade to Vercel Pro if:**
- ✅ Average response time > 1500ms consistently
- ✅ Error rate > 5%
- ✅ You see 429 rate limit errors
- ✅ You have 20+ active users during events
- ✅ Slow call rate > 20%

**Stay on Free Tier if:**
- ✅ Average response time < 1000ms
- ✅ Error rate < 3%
- ✅ No rate limit errors
- ✅ Testing with < 15 users
- ✅ Only occasional usage

## Technical Details

### Monitored Endpoints

- `GET /api/events/[eventId]/state` (polling - most frequent)
- `POST /api/lots/[lotId]/open`
- `POST /api/lots/[lotId]/bid`
- `POST /api/lots/[lotId]/accept`
- `POST /api/lots/[lotId]/pause`
- `POST /api/events/[eventId]/undo`
- `GET /api/events/[eventId]/recap`
- `GET /api/events/[eventId]/player-links`

### Data Storage

- Metrics stored in browser localStorage
- Last 100 API calls retained
- Last 50 errors retained
- Cleared on browser refresh (unless exported)

### Performance Impact

- Monitoring overhead: < 5ms per request
- No server-side logging
- Minimal memory usage
- No impact on app performance
