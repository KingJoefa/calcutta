#!/usr/bin/env node

/**
 * Load Testing Script for Calcutta Auction App
 * Simulates realistic auction activity with multiple concurrent users
 */

const BASE_URL = 'http://localhost:3000';

// Test configuration
const CONFIG = {
  numSimulatedUsers: 20, // Simulate 20 concurrent users
  pollingInterval: 750, // Match production polling (750ms)
  biddingDelay: 2000, // 2 seconds between bids
  auctionDuration: 30000, // 30 second test
};

// Helper to make API calls with timing
async function apiCall(endpoint, options = {}) {
  const startTime = Date.now();
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const duration = Date.now() - startTime;
    const status = response.status;

    let data = null;
    if (response.ok) {
      data = await response.json().catch(() => null);
    }

    return { success: response.ok, status, duration, data };
  } catch (error) {
    const duration = Date.now() - startTime;
    return { success: false, status: 0, duration, error: error.message };
  }
}

// Create test event
async function createEvent() {
  console.log('📝 Creating test event...');

  const result = await apiCall('/api/events', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Load Test Event',
      ruleSet: {
        anteCents: 1000, // $10
        minIncrementCents: 500, // $5
        auctionTimerSeconds: 45,
        antiSnipeExtensionSeconds: 17,
        intermissionSeconds: 5,
        roundAllocations: {
          wildcard: 0.04,
          divisional: 0.06,
          conference: 0.12,
          superbowl: 0.28,
        },
        payoutBasis: 'total_pot',
        includeAnteInPot: true,
      },
      players: [
        { name: 'Alice', handle: '@alice' },
        { name: 'Bob', handle: '@bob' },
        { name: 'Carol', handle: '@carol' },
        { name: 'Dave', handle: '@dave' },
        { name: 'Eve', handle: '@eve' },
        { name: 'Frank', handle: '@frank' },
      ],
      teams: [
        { name: 'Kansas City Chiefs', region: 'AFC', seed: 1 },
        { name: 'Buffalo Bills', region: 'AFC', seed: 2 },
        { name: 'Baltimore Ravens', region: 'AFC', seed: 3 },
        { name: 'Houston Texans', region: 'AFC', seed: 4 },
        { name: 'Detroit Lions', region: 'NFC', seed: 1 },
        { name: 'Philadelphia Eagles', region: 'NFC', seed: 2 },
        { name: 'Tampa Bay Buccaneers', region: 'NFC', seed: 3 },
        { name: 'Los Angeles Rams', region: 'NFC', seed: 4 },
      ],
    }),
  });

  if (!result.success) {
    throw new Error(`Failed to create event: ${result.status} ${result.error || ''}`);
  }

  console.log(`✅ Event created: ${result.data.eventId} (${result.duration}ms)`);
  return result.data.eventId;
}

// Get event state
async function getEventState(eventId) {
  const result = await apiCall(`/api/events/${eventId}/state`);
  return result.success ? result.data : null;
}

// Open a lot for bidding
async function openLot(lotId, playerId, openingBidCents) {
  return await apiCall(`/api/lots/${lotId}/open`, {
    method: 'POST',
    body: JSON.stringify({ playerId, openingBidCents }),
  });
}

// Place a bid
async function placeBid(lotId, playerId, amountCents) {
  return await apiCall(`/api/lots/${lotId}/bid`, {
    method: 'POST',
    body: JSON.stringify({ playerId, amountCents }),
  });
}

// Accept and sell lot
async function sellLot(lotId) {
  const acceptResult = await apiCall(`/api/lots/${lotId}/accept`, {
    method: 'POST',
  });

  if (!acceptResult.success) return acceptResult;

  // Small delay before selling
  await new Promise(resolve => setTimeout(resolve, 100));

  return await apiCall(`/api/lots/${lotId}/sell`, {
    method: 'POST',
  });
}

// Simulate a single user polling
async function simulateUserPolling(eventId, userId, stats) {
  const pollOnce = async () => {
    const result = await apiCall(`/api/events/${eventId}/state`);
    stats.totalPolls++;
    stats.pollDurations.push(result.duration);

    if (!result.success) {
      stats.pollErrors++;
      if (result.status === 429) {
        stats.rateLimitErrors++;
      }
    }
  };

  // Poll continuously
  const intervalId = setInterval(pollOnce, CONFIG.pollingInterval);
  return intervalId;
}

// Simulate bidding behavior
async function simulateBidding(eventId, state, stats) {
  if (!state.currentLot || state.currentLot.status !== 'open') {
    return;
  }

  const players = state.players || [];
  if (players.length === 0) return;

  // Random player places a bid
  const randomPlayer = players[Math.floor(Math.random() * players.length)];
  const currentBid = state.currentLot.currentBidCents || 0;
  const minIncrement = state.ruleSet?.minIncrementCents || 500;
  const newBid = currentBid + minIncrement + Math.floor(Math.random() * 1000);

  const result = await placeBid(state.currentLot.id, randomPlayer.id, newBid);
  stats.totalBids++;
  stats.bidDurations.push(result.duration);

  if (!result.success) {
    stats.bidErrors++;
    if (result.status === 429) {
      stats.rateLimitErrors++;
    }
  } else {
    console.log(`  💰 ${randomPlayer.name} bid $${(newBid / 100).toFixed(2)} (${result.duration}ms)`);
  }
}

// Main test function
async function runLoadTest() {
  console.log('🚀 Starting Load Test');
  console.log(`   Simulated Users: ${CONFIG.numSimulatedUsers}`);
  console.log(`   Test Duration: ${CONFIG.auctionDuration / 1000}s`);
  console.log('');

  const stats = {
    totalPolls: 0,
    pollErrors: 0,
    totalBids: 0,
    bidErrors: 0,
    rateLimitErrors: 0,
    pollDurations: [],
    bidDurations: [],
    startTime: Date.now(),
  };

  try {
    // Create event
    const eventId = await createEvent();

    // Get initial state
    const initialState = await getEventState(eventId);
    if (!initialState) {
      throw new Error('Failed to fetch initial state');
    }

    const players = initialState.players || [];
    const lots = initialState.lots || [];

    console.log(`📊 Event has ${players.length} players and ${lots.length} teams`);
    console.log('');

    // Start simulated user polling
    console.log(`👥 Starting ${CONFIG.numSimulatedUsers} simulated users (polling every ${CONFIG.pollingInterval}ms)...`);
    const pollingIntervals = [];
    for (let i = 0; i < CONFIG.numSimulatedUsers; i++) {
      const intervalId = await simulateUserPolling(eventId, i, stats);
      pollingIntervals.push(intervalId);
    }

    // Give polling some time to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('');
    console.log('🎯 Starting auction simulation...');
    console.log('');

    // Auction loop
    const auctionEndTime = Date.now() + CONFIG.auctionDuration;
    let currentLotIndex = 0;

    while (Date.now() < auctionEndTime && currentLotIndex < lots.length) {
      const state = await getEventState(eventId);
      const currentLot = state?.currentLot;

      // If no lot is open, open the next one
      if (!currentLot || currentLot.status !== 'open') {
        const nextLot = lots[currentLotIndex];
        if (!nextLot) break;

        console.log(`📦 Opening lot: ${nextLot.team.name}`);
        const openResult = await openLot(
          nextLot.id,
          players[0].id,
          state.ruleSet?.minIncrementCents || 500
        );

        stats.bidDurations.push(openResult.duration);

        if (!openResult.success) {
          console.error(`❌ Failed to open lot: ${openResult.status}`);
          break;
        }

        console.log(`✅ Lot opened (${openResult.duration}ms)`);
      }

      // Simulate multiple concurrent bids
      const numBids = Math.floor(Math.random() * 5) + 3; // 3-7 bids
      const bidPromises = [];

      for (let i = 0; i < numBids; i++) {
        bidPromises.push(
          new Promise(resolve => {
            setTimeout(async () => {
              const latestState = await getEventState(eventId);
              await simulateBidding(eventId, latestState, stats);
              resolve();
            }, Math.random() * CONFIG.biddingDelay);
          })
        );
      }

      await Promise.all(bidPromises);

      // Wait a bit before selling
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Sell the lot
      const state2 = await getEventState(eventId);
      if (state2?.currentLot?.status === 'open') {
        console.log(`  🔨 Selling lot...`);
        const sellResult = await sellLot(state2.currentLot.id);

        if (sellResult.success) {
          console.log(`  ✅ Lot sold (${sellResult.duration}ms)`);
          console.log('');
        } else {
          console.error(`  ❌ Failed to sell: ${sellResult.status}`);
        }
      }

      currentLotIndex++;
    }

    // Stop polling
    console.log('');
    console.log('⏹️  Stopping simulated users...');
    pollingIntervals.forEach(id => clearInterval(id));

    // Wait for last polls to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Calculate statistics
    stats.endTime = Date.now();
    stats.totalDuration = stats.endTime - stats.startTime;

    console.log('');
    console.log('📈 LOAD TEST RESULTS');
    console.log('='.repeat(60));

    // Polling stats
    const avgPollDuration = stats.pollDurations.length > 0
      ? Math.round(stats.pollDurations.reduce((a, b) => a + b, 0) / stats.pollDurations.length)
      : 0;
    const maxPollDuration = stats.pollDurations.length > 0
      ? Math.max(...stats.pollDurations)
      : 0;
    const minPollDuration = stats.pollDurations.length > 0
      ? Math.min(...stats.pollDurations)
      : 0;

    console.log('');
    console.log('🔄 POLLING PERFORMANCE');
    console.log(`   Total Polls: ${stats.totalPolls}`);
    console.log(`   Poll Errors: ${stats.pollErrors} (${((stats.pollErrors / stats.totalPolls) * 100).toFixed(1)}%)`);
    console.log(`   Avg Duration: ${avgPollDuration}ms`);
    console.log(`   Min Duration: ${minPollDuration}ms`);
    console.log(`   Max Duration: ${maxPollDuration}ms`);

    // Bidding stats
    const avgBidDuration = stats.bidDurations.length > 0
      ? Math.round(stats.bidDurations.reduce((a, b) => a + b, 0) / stats.bidDurations.length)
      : 0;
    const maxBidDuration = stats.bidDurations.length > 0
      ? Math.max(...stats.bidDurations)
      : 0;

    console.log('');
    console.log('💰 BIDDING PERFORMANCE');
    console.log(`   Total Bids: ${stats.totalBids}`);
    console.log(`   Bid Errors: ${stats.bidErrors} (${stats.totalBids > 0 ? ((stats.bidErrors / stats.totalBids) * 100).toFixed(1) : 0}%)`);
    console.log(`   Avg Duration: ${avgBidDuration}ms`);
    console.log(`   Max Duration: ${maxBidDuration}ms`);

    // Rate limiting
    console.log('');
    console.log('⚠️  RATE LIMITING');
    console.log(`   429 Errors: ${stats.rateLimitErrors}`);

    // Overall assessment
    console.log('');
    console.log('🎯 ASSESSMENT');

    const totalErrors = stats.pollErrors + stats.bidErrors;
    const totalRequests = stats.totalPolls + stats.totalBids;
    const errorRate = (totalErrors / totalRequests) * 100;

    console.log(`   Total Requests: ${totalRequests}`);
    console.log(`   Error Rate: ${errorRate.toFixed(1)}%`);
    console.log(`   Test Duration: ${(stats.totalDuration / 1000).toFixed(1)}s`);
    console.log(`   Requests/Second: ${Math.round(totalRequests / (stats.totalDuration / 1000))}`);

    console.log('');

    // Health assessment
    if (stats.rateLimitErrors > 0) {
      console.log('🔴 CRITICAL: Rate limit errors detected!');
      console.log('   → Hitting Vercel free tier limits');
      console.log('   → RECOMMENDATION: Upgrade to Vercel Pro ($20/mo)');
    } else if (errorRate > 10 || avgPollDuration > 2000) {
      console.log('🔴 POOR: High error rate or slow responses');
      console.log('   → System struggling with load');
      console.log('   → RECOMMENDATION: Upgrade to Vercel Pro ($20/mo)');
    } else if (errorRate > 5 || avgPollDuration > 1500) {
      console.log('🟡 WARNING: Elevated errors or response times');
      console.log('   → System under stress');
      console.log('   → RECOMMENDATION: Consider Vercel Pro for production');
    } else {
      console.log('🟢 HEALTHY: System performing well');
      console.log('   → Free tier handling load adequately');
      console.log('   → Safe for similar user counts');
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('');

    // Save results to file
    const resultsFile = `/tmp/calcutta-load-test-${Date.now()}.json`;
    const fs = await import('fs');
    fs.writeFileSync(resultsFile, JSON.stringify({
      config: CONFIG,
      stats: {
        ...stats,
        avgPollDuration,
        maxPollDuration,
        minPollDuration,
        avgBidDuration,
        maxBidDuration,
        errorRate,
      },
    }, null, 2));

    console.log(`💾 Full results saved to: ${resultsFile}`);
    console.log('');

    return eventId;

  } catch (error) {
    console.error('');
    console.error('❌ Load test failed:', error.message);
    console.error('');
    throw error;
  }
}

// Run the test
runLoadTest()
  .then(() => {
    console.log('✅ Load test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Load test failed:', error);
    process.exit(1);
  });
