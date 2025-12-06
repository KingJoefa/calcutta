import { describe, it, expect } from "vitest";
import {
	computePayoutProjections,
	computePayoutsFromResults,
	computeTotalPotCents,
} from "../src/lib/payout";

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

describe("payout engine - total pot and results", () => {
	const baseRuleSet = {
		roundAllocations: {
			wildcard: 0.04,
			divisional: 0.06,
			conference: 0.12,
			superbowl: 0.28,
		},
		payoutBasis: "total_pot",
		includeAnteInPot: true,
	} as any;

	it("computes potential payouts from total pot", () => {
		const sales = [
			{ teamId: "t1", playerId: "A", amountCents: 10000 },
			{ teamId: "t2", playerId: "B", amountCents: 5000 },
		] as any;
		const anteLedger = [
			{ playerId: "A", amountCents: 2000 },
			{ playerId: "B", amountCents: 2000 },
		];
		const totalPot = computeTotalPotCents({ sales, anteLedger });
		const proj = computePayoutProjections({
			ruleSet: baseRuleSet,
			sales,
			anteLedger,
			totalPotCents: totalPot,
		});
		const expectedRound = (pct: number) => Math.floor(totalPot * pct);
		expect(proj["A"].byTeam["t1"].amountCentsByRound["wildcard"]).toBe(
			expectedRound(0.04),
		);
		expect(proj["A"].totalPotentialCents).toBe(
			expectedRound(0.04) +
				expectedRound(0.06) +
				expectedRound(0.12) +
				expectedRound(0.28),
		);
	});

	it("distributes winnings by round and nets per player", () => {
		const sales = [
			{ teamId: "t1", playerId: "A", amountCents: 10000 },
			{ teamId: "t2", playerId: "B", amountCents: 5000 },
		] as any;
		const anteLedger = [
			{ playerId: "A", amountCents: 2000 },
			{ playerId: "B", amountCents: 2000 },
		];
		const teamResults = [
			{ teamId: "t1", roundResults: { wildcard: "W", divisional: "L" } },
			{ teamId: "t2", roundResults: { wildcard: "W", divisional: "W", conference: "L" } },
		];

		const { playerPayouts, totalPotCents } = computePayoutsFromResults({
			ruleSet: baseRuleSet,
			sales,
			anteLedger,
			teamResults,
		});

		const roundShare = (pct: number) => Math.floor(totalPotCents * pct);
		expect(playerPayouts["A"].winningsByRound["wildcard"]).toBe(roundShare(0.04));
		expect(playerPayouts["B"].winningsByRound["wildcard"]).toBe(roundShare(0.04));
		expect(playerPayouts["B"].winningsByRound["divisional"]).toBe(roundShare(0.06));

		expect(playerPayouts["A"].spentAnteCents).toBe(2000);
		expect(playerPayouts["A"].spentBidsCents).toBe(10000);
		expect(playerPayouts["A"].netCents).toBe(
			playerPayouts["A"].totalWinningsCents - 12000,
		);
	});
});

