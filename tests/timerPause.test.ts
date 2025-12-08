import { describe, it, expect } from "vitest";

/**
 * Test pause/resume timer math logic
 * 
 * When a timer is paused:
 * - pausedAt is set to the current time
 * - closesAt remains unchanged (represents the original end time)
 * 
 * When a timer is resumed:
 * - Calculate paused duration: now - pausedAt
 * - Add paused duration to closesAt: newClosesAt = closesAt + pausedDuration
 * - Clear pausedAt (set to null)
 * - Accumulate pauseDurationSeconds
 * 
 * Timer calculation:
 * - If paused: remaining = closesAt - pausedAt (frozen)
 * - If not paused: remaining = closesAt - now (counting down)
 */

describe("Timer pause/resume math", () => {
	it("calculates remaining time correctly when paused", () => {
		const now = Date.now();
		const closesAt = new Date(now + 30000); // 30 seconds from now
		const pausedAt = new Date(now + 10000); // Paused 10 seconds after start (20s remaining)

		// When paused, remaining time = closesAt - pausedAt (frozen)
		const remainingMs = closesAt.getTime() - pausedAt.getTime();
		const remainingSeconds = Math.floor(remainingMs / 1000);

		expect(remainingSeconds).toBe(20); // 30 - 10 = 20 seconds remaining
	});

	it("calculates remaining time correctly when not paused", () => {
		const now = Date.now();
		const closesAt = new Date(now + 30000); // 30 seconds from now

		// When not paused, remaining time = closesAt - now
		const remainingMs = closesAt.getTime() - now;
		const remainingSeconds = Math.floor(remainingMs / 1000);

		expect(remainingSeconds).toBe(30); // Should be close to 30 seconds
		expect(remainingSeconds).toBeGreaterThan(29);
		expect(remainingSeconds).toBeLessThan(31);
	});

	it("calculates pause duration correctly", () => {
		const pauseStart = new Date(1000000); // Arbitrary timestamp
		const pauseEnd = new Date(1000000 + 5000); // 5 seconds later

		const pauseDurationMs = pauseEnd.getTime() - pauseStart.getTime();
		const pauseDurationSeconds = Math.floor(pauseDurationMs / 1000);

		expect(pauseDurationSeconds).toBe(5);
	});

	it("adjusts closesAt correctly when resuming", () => {
		const originalClosesAt = new Date(1000000 + 30000); // 30 seconds from start
		const pauseStart = new Date(1000000 + 10000); // Paused at 10 seconds
		const pauseEnd = new Date(1000000 + 15000); // Resumed at 15 seconds (5 seconds paused)

		// Calculate pause duration
		const pauseDurationMs = pauseEnd.getTime() - pauseStart.getTime();
		const pauseDurationSeconds = Math.floor(pauseDurationMs / 1000);

		expect(pauseDurationSeconds).toBe(5);

		// New closesAt = original closesAt + pause duration
		const newClosesAt = new Date(originalClosesAt.getTime() + pauseDurationMs);

		// Verify: original was 30s from start, paused for 5s, so new should be 35s from start
		expect(newClosesAt.getTime()).toBe(1000000 + 35000);
	});

	it("handles multiple pause/resume cycles", () => {
		const startTime = 1000000;
		const originalClosesAt = new Date(startTime + 60000); // 60 seconds from start
		let totalPauseDuration = 0;
		let currentClosesAt = originalClosesAt.getTime();

		// First pause: 10s into timer, pause for 5s
		const pause1Start = new Date(startTime + 10000);
		const pause1End = new Date(startTime + 15000);
		const pause1Duration = pause1End.getTime() - pause1Start.getTime();
		totalPauseDuration += pause1Duration;
		currentClosesAt += pause1Duration;

		expect(totalPauseDuration).toBe(5000);
		expect(currentClosesAt).toBe(startTime + 65000); // 60s + 5s = 65s

		// Second pause: 20s after first resume, pause for 3s
		const pause2Start = new Date(startTime + 35000); // 15s (resume) + 20s = 35s
		const pause2End = new Date(startTime + 38000); // 35s + 3s = 38s
		const pause2Duration = pause2End.getTime() - pause2Start.getTime();
		totalPauseDuration += pause2Duration;
		currentClosesAt += pause2Duration;

		expect(totalPauseDuration).toBe(8000); // 5s + 3s = 8s
		expect(currentClosesAt).toBe(startTime + 68000); // 60s + 8s = 68s

		// Final remaining time calculation (at pause2End, with 68s closesAt)
		const finalRemaining = currentClosesAt - pause2End.getTime();
		const finalRemainingSeconds = Math.floor(finalRemaining / 1000);

		expect(finalRemainingSeconds).toBe(30); // 68s - 38s = 30s remaining
	});

	it("handles edge case: pause immediately before timer expires", () => {
		const now = Date.now();
		const closesAt = new Date(now + 5000); // 5 seconds remaining
		const pausedAt = new Date(now + 5000); // Paused right at expiration

		const remainingMs = closesAt.getTime() - pausedAt.getTime();
		const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));

		expect(remainingSeconds).toBe(0); // No time remaining
	});

	it("handles edge case: resume extends timer beyond original expiration", () => {
		const originalClosesAt = new Date(1000000 + 30000); // 30s from start
		const pauseStart = new Date(1000000 + 25000); // Paused at 25s (5s remaining)
		const pauseEnd = new Date(1000000 + 35000); // Resumed at 35s (paused for 10s)

		const pauseDurationMs = pauseEnd.getTime() - pauseStart.getTime();
		const newClosesAt = new Date(originalClosesAt.getTime() + pauseDurationMs);

		// New closesAt should be 30s + 10s = 40s from start
		expect(newClosesAt.getTime()).toBe(1000000 + 40000);

		// Remaining time at resume point
		const remainingAtResume = newClosesAt.getTime() - pauseEnd.getTime();
		const remainingSeconds = Math.floor(remainingAtResume / 1000);

		expect(remainingSeconds).toBe(5); // 40s - 35s = 5s remaining (same as when paused)
	});

	it("calculates correct remaining time after resume", () => {
		const originalClosesAt = new Date(1000000 + 30000); // 30s from start
		const pauseStart = new Date(1000000 + 10000); // Paused at 10s
		const pauseEnd = new Date(1000000 + 15000); // Resumed at 15s (5s pause)
		const newClosesAt = new Date(originalClosesAt.getTime() + (pauseEnd.getTime() - pauseStart.getTime()));

		// At resume time (15s), calculate remaining
		const remainingAtResume = newClosesAt.getTime() - pauseEnd.getTime();
		const remainingSeconds = Math.floor(remainingAtResume / 1000);

		expect(remainingSeconds).toBe(20); // Should still have 20s remaining (30s - 10s)
		expect(newClosesAt.getTime()).toBe(1000000 + 35000); // 30s + 5s pause = 35s
	});
});

