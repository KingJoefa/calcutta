import type { LedgerEntry, RuleSet, Sale, Team, Player, Lot } from "../generated/prisma";

export type ResultsSummary = {
	allSold: boolean;
	totalTeams: number;
	soldCount: number;
	totalSalesCents: number;
	anteCents: number;
	potCents: number; // sum of winning sale prices (NOT all bids)
	allBidsCents: number; // sum of every bid placed (informational)
	avgSaleCents: number | null;
	maxSaleCents: number | null;
	minSaleCents: number | null;
};

export type OwnerBreakdown = {
	playerId: string;
	name: string;
	handle?: string | null;
	totalSpendCents: number;
	teamCount: number;
	teams: Array<{ teamId: string; teamName: string; amountCents: number }>;
};

export type TopSale = {
	teamName: string;
	playerName: string;
	amountCents: number;
	finalizedAt: string;
};

export function buildResultsSummary(args: {
	lots: Array<Pick<Lot, "id" | "status">>;
	sales: Array<Pick<Sale, "amountCents">>;
	ledger: Array<Pick<LedgerEntry, "type" | "amountCents">>;
	ruleSet: Pick<RuleSet, "includeAnteInPot"> | null;
	allBidsCents?: number;
}): ResultsSummary {
	const { lots, sales, ledger, ruleSet } = args;
	const soldCount = sales.length;
	const totalTeams = lots.length;
	const allSold = totalTeams > 0 && soldCount === totalTeams;
	const totalSalesCents = sales.reduce((sum, s) => sum + (s.amountCents ?? 0), 0);
	const anteCents = ledger
		.filter((l) => l.type === "ante")
		.reduce((sum, l) => sum + (l.amountCents ?? 0), 0);
	// Total Pot = sum of winning sale prices, plus ante if configured to include ante.
	const potCents = totalSalesCents + (ruleSet?.includeAnteInPot ? anteCents : 0);
	const maxSaleCents = sales.length ? Math.max(...sales.map((s) => s.amountCents ?? 0)) : null;
	const minSaleCents = sales.length ? Math.min(...sales.map((s) => s.amountCents ?? 0)) : null;
	const avgSaleCents = sales.length ? Math.round(totalSalesCents / sales.length) : null;
	// allBidsCents is informational; default to totalSales if not provided.
	const allBidsCents = args.allBidsCents ?? totalSalesCents;

	return {
		allSold,
		totalTeams,
		soldCount,
		totalSalesCents,
		anteCents,
		potCents,
		allBidsCents,
		avgSaleCents,
		maxSaleCents,
		minSaleCents,
	};
}

export function buildOwnerBreakdown(args: {
	players: Array<Pick<Player, "id" | "name" | "handle">>;
	sales: Array<
		Pick<Sale, "playerId" | "amountCents"> & {
			lot: { team: Pick<Team, "id" | "name"> };
		}
	>;
}): OwnerBreakdown[] {
	const owners: Record<string, OwnerBreakdown> = {};
	for (const player of args.players) {
		owners[player.id] = {
			playerId: player.id,
			name: player.name,
			handle: player.handle,
			totalSpendCents: 0,
			teamCount: 0,
			teams: [],
		};
	}

	for (const sale of args.sales) {
		const owner = owners[sale.playerId];
		if (!owner) continue;
		owner.totalSpendCents += sale.amountCents ?? 0;
		owner.teamCount += 1;
		owner.teams.push({
			teamId: sale.lot.team.id,
			teamName: sale.lot.team.name,
			amountCents: sale.amountCents ?? 0,
		});
	}

	return Object.values(owners).sort((a, b) => b.totalSpendCents - a.totalSpendCents);
}

export function buildTopSales(args: {
	sales: Array<
		Pick<Sale, "amountCents" | "finalizedAt"> & {
			player: Pick<Player, "name">;
			lot: { team: Pick<Team, "name"> };
		}
	>;
	limit?: number;
}): TopSale[] {
	const limit = args.limit ?? 3;
	return [...args.sales]
		.sort((a, b) => (b.amountCents ?? 0) - (a.amountCents ?? 0))
		.slice(0, limit)
		.map((s) => ({
			teamName: s.lot.team.name,
			playerName: s.player.name,
			amountCents: s.amountCents ?? 0,
			finalizedAt: s.finalizedAt.toISOString(),
		}));
}
