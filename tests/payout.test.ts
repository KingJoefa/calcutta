import { describe, it, expect } from "vitest";
import { computePayoutProjections } from "../src/lib/payout";

describe("payout engine", () => {
	it("allocates round percentages correctly", () => {
		const ruleSet = {
			id: "rs1",
			eventId: "e1",
			anteCents: 0,
			minIncrementCents: 100,
			auctionTimerSeconds: 30,
			antiSnipeExtensionSeconds: 10,
			roundAllocations: {
				wildcard: 0.1,
				divisional: 0.2,
				conference: 0.3,
				superbowl: 0.4,
			},
			additiveCombos: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any;
		const sales = [
			{
				id: "s1",
				eventId: "e1",
				lotId: "t1",
				entrantId: "A",
				amountCents: 10000,
				finalizedAt: new Date(),
				team: { id: "t1", name: "Team1" },
				entrant: { id: "A", name: "Alice" },
			},
			{
				id: "s2",
				eventId: "e1",
				lotId: "t2",
				entrantId: "B",
				amountCents: 5000,
				finalizedAt: new Date(),
				team: { id: "t2", name: "Team2" },
				entrant: { id: "B", name: "Bob" },
			},
		] as any;
		const proj = computePayoutProjections({ ruleSet, sales });
		expect(proj["A"].totalPotentialCents).toBe(
			Math.floor(10000 * 0.1) +
				Math.floor(10000 * 0.2) +
				Math.floor(10000 * 0.3) +
				Math.floor(10000 * 0.4),
		);
		expect(proj["B"].totalPotentialCents).toBe(
			Math.floor(5000 * 0.1) +
				Math.floor(5000 * 0.2) +
				Math.floor(5000 * 0.3) +
				Math.floor(5000 * 0.4),
		);
	});
});


