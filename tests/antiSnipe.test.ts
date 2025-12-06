import { describe, it, expect } from "vitest";
import { computeAntiSnipeExtension } from "../src/lib/antiSnipe";

describe("anti-snipe extension", () => {
	it("extends when inside window", () => {
		const now = 1000;
		const closes = 2000;
		const res = computeAntiSnipeExtension({
			nowMs: now,
			closesAtMs: closes,
			antiSnipeWindowSeconds: 2,
			extendBySeconds: 5,
		});
		expect(res.shouldExtend).toBe(true);
		expect(res.newClosesAtMs).toBe(closes + 5000);
	});

	it("does not extend when outside window", () => {
		const now = 1000;
		const closes = 10000;
		const res = computeAntiSnipeExtension({
			nowMs: now,
			closesAtMs: closes,
			antiSnipeWindowSeconds: 2,
			extendBySeconds: 5,
		});
		expect(res.shouldExtend).toBe(false);
		expect(res.newClosesAtMs).toBe(closes);
	});
});


