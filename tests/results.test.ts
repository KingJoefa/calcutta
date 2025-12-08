import { describe, it, expect } from "vitest";
import { buildOwnerBreakdown, buildResultsSummary, buildTopSales } from "../src/lib/results";

describe("results summary helpers", () => {
	const baseRuleSet = { includeAnteInPot: true } as any;
	const lots = [
		{ id: "l1", status: "sold" },
		{ id: "l2", status: "sold" },
		{ id: "l3", status: "pending" },
	] as any;

	const sales = [
		{ amountCents: 10000, playerId: "p1", lot: { team: { id: "t1", name: "Team1" } } },
		{ amountCents: 5000, playerId: "p2", lot: { team: { id: "t2", name: "Team2" } } },
	] as any;

	const ledger = [
		{ type: "ante", amountCents: 2000 },
		{ type: "ante", amountCents: 2000 },
		{ type: "sale", amountCents: 5000 },
	] as any;

	it("computes summary stats", () => {
		const summary = buildResultsSummary({ lots, sales, ledger, ruleSet: baseRuleSet });
		expect(summary.totalTeams).toBe(3);
		expect(summary.soldCount).toBe(2);
		expect(summary.allSold).toBe(false);
		expect(summary.totalSalesCents).toBe(15000);
		expect(summary.anteCents).toBe(4000);
		expect(summary.potCents).toBe(19000);
		expect(summary.maxSaleCents).toBe(10000);
		expect(summary.minSaleCents).toBe(5000);
		expect(summary.avgSaleCents).toBe(Math.round(15000 / 2));
	});

	it("builds owner breakdown sorted by spend", () => {
		const owners = buildOwnerBreakdown({
			players: [
				{ id: "p1", name: "Alice", handle: "@a" },
				{ id: "p2", name: "Bob", handle: null },
			],
			sales,
		});
		expect(owners[0].name).toBe("Alice");
		expect(owners[0].totalSpendCents).toBe(10000);
		expect(owners[0].teams[0].teamName).toBe("Team1");
		expect(owners[1].totalSpendCents).toBe(5000);
	});

	it("returns top sales descending", () => {
		const top = buildTopSales({
			sales: [
				{ amountCents: 5000, finalizedAt: new Date("2020-01-01"), player: { name: "A" }, lot: { team: { name: "X" } } },
				{ amountCents: 12000, finalizedAt: new Date("2020-01-02"), player: { name: "B" }, lot: { team: { name: "Y" } } },
				{ amountCents: 9000, finalizedAt: new Date("2020-01-03"), player: { name: "C" }, lot: { team: { name: "Z" } } },
			] as any,
			limit: 2,
		});
		expect(top).toHaveLength(2);
		expect(top[0].amountCents).toBe(12000);
		expect(top[0].playerName).toBe("B");
		expect(top[1].teamName).toBe("Z");
		expect(typeof top[0].finalizedAt).toBe("string");
	});
});
