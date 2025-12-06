import type { RuleSet, Sale } from "../generated/prisma";

export type PayoutProjection = {
	playerId: string;
	totalPotentialCents: number;
	byTeam: Record<
		string,
		{
			teamId: string;
			amountCentsByRound: Record<string, number>;
		}
	>;
};

export type PayoutBasis = "team_price" | "total_pot";
export type RoundResultCode = "W" | "L" | "B" | "BYE" | "OUT" | "";

export type TeamResultInput = {
	teamId: string;
	roundResults: Record<string, RoundResultCode>;
};

export type PlayerPayout = {
	playerId: string;
	spentAnteCents: number;
	spentBidsCents: number;
	winningsByRound: Record<string, number>;
	totalWinningsCents: number;
	netCents: number;
};

export type TeamPayout = {
	teamId: string;
	ownerPlayerId: string;
	saleAmountCents: number;
	payoutByRound: Record<string, number>;
	totalPayoutCents: number;
};

/**
 * Compute provisional payout projections based on RuleSet.roundAllocations.
 * The projection models the additive payouts a team would earn for each round advanced.
 */
export type PayoutSale = Partial<Sale> & {
	amountCents: number;
	lotId?: string | null;
	playerId?: string | null;
	entrantId?: string | null;
	teamId?: string | null;
	team?: { id: string | null };
	player?: { id: string | null };
	entrant?: { id: string | null };
};

function resolvePlayerId(sale: PayoutSale): string | undefined {
	return (
		sale.playerId ??
		sale.entrantId ??
		sale.player?.id ??
		sale.entrant?.id ??
		undefined
	) ?? undefined;
}

function resolveTeamId(sale: PayoutSale): string | undefined {
	return sale.teamId ?? sale.lotId ?? sale.team?.id ?? undefined;
}

export function computePayoutProjections(args: {
	ruleSet: Pick<RuleSet, "roundAllocations"> & {
		payoutBasis?: PayoutBasis;
		includeAnteInPot?: boolean;
	};
	sales: PayoutSale[];
	anteLedger?: Array<{ playerId?: string | null; amountCents: number }>;
	totalPotCents?: number;
	roundKeysOrder?: string[];
}): Record<string, PayoutProjection> {
	const { ruleSet, sales } = args;
	const roundAlloc = (ruleSet.roundAllocations ?? {}) as Record<string, number>;
	const orderedRoundKeys = args.roundKeysOrder ?? Object.keys(roundAlloc);

	const projectionByPlayer: Record<string, PayoutProjection> = {};
	const payoutBasis: PayoutBasis = ruleSet.payoutBasis ?? "team_price";
	const totalPot =
		payoutBasis === "total_pot"
			? args.totalPotCents ??
				computeTotalPotCents({
					sales,
					includeAnteInPot: ruleSet.includeAnteInPot ?? true,
					anteLedger: args.anteLedger,
				})
			: null;

	for (const sale of sales) {
		const playerId = resolvePlayerId(sale);
		if (!playerId) continue; // ignore orphaned records
		const teamId = resolveTeamId(sale) ?? "unknown";

		if (!projectionByPlayer[playerId]) {
			projectionByPlayer[playerId] = {
				playerId,
				totalPotentialCents: 0,
				byTeam: {},
			};
		}

		const proj = projectionByPlayer[playerId];
		if (!proj.byTeam[teamId]) {
			proj.byTeam[teamId] = {
				teamId,
				amountCentsByRound: {},
			};
		}

		let cumulative = 0;
		for (const key of orderedRoundKeys) {
			const pct = roundAlloc[key] ?? 0;
			const base = payoutBasis === "total_pot" ? totalPot ?? 0 : sale.amountCents;
			const amount = Math.floor(base * pct);
			cumulative += amount;
			proj.byTeam[teamId].amountCentsByRound[key] = amount;
		}
		proj.totalPotentialCents += cumulative;
	}

	return projectionByPlayer;
}

export function computeTotalPotCents(args: {
	sales: PayoutSale[];
	anteLedger?: Array<{ playerId?: string | null; amountCents: number }>;
	includeAnteInPot?: boolean;
}): number {
	const salesTotal = args.sales.reduce((sum, sale) => sum + (sale.amountCents ?? 0), 0);
	const anteTotal =
		args.includeAnteInPot === false
			? 0
			: (args.anteLedger ?? []).reduce(
					(sum, entry) => sum + (entry?.amountCents ?? 0),
					0,
				);
	return salesTotal + anteTotal;
}

export function computePayoutsFromResults(args: {
	ruleSet: Pick<RuleSet, "roundAllocations"> & {
		payoutBasis?: PayoutBasis;
		includeAnteInPot?: boolean;
		additiveCombos?: boolean;
	};
	sales: PayoutSale[];
	teamResults: TeamResultInput[];
	anteLedger?: Array<{ playerId?: string | null; amountCents: number }>;
	roundKeysOrder?: string[];
}): {
	totalPotCents: number;
	teamPayouts: TeamPayout[];
	playerPayouts: Record<string, PlayerPayout>;
} {
	const { ruleSet, sales, anteLedger } = args;
	const roundAlloc = (ruleSet.roundAllocations ?? {}) as Record<string, number>;
	const orderedRoundKeys = args.roundKeysOrder ?? Object.keys(roundAlloc);
	const payoutBasis: PayoutBasis = ruleSet.payoutBasis ?? "team_price";

	const salesByTeam: Record<string, PayoutSale> = {};
	for (const sale of sales) {
		const teamId = resolveTeamId(sale);
		if (teamId) salesByTeam[teamId] = sale;
	}

	const totalPotCents =
		payoutBasis === "total_pot"
			? computeTotalPotCents({
					sales,
					includeAnteInPot: ruleSet.includeAnteInPot ?? true,
					anteLedger,
				})
			: 0;

	const teamPayouts: TeamPayout[] = [];
	const winningsByPlayer: Record<string, PlayerPayout> = {};

	const ensurePlayer = (playerId: string) => {
		if (!winningsByPlayer[playerId]) {
			winningsByPlayer[playerId] = {
				playerId,
				spentAnteCents: 0,
				spentBidsCents: 0,
				winningsByRound: {},
				totalWinningsCents: 0,
				netCents: 0,
			};
		}
		return winningsByPlayer[playerId];
	};

	for (const sale of sales) {
		const playerId = resolvePlayerId(sale);
		if (playerId) {
			const p = ensurePlayer(playerId);
			p.spentBidsCents += sale.amountCents ?? 0;
		}
	}

	for (const entry of anteLedger ?? []) {
		if (entry?.playerId) {
			const p = ensurePlayer(entry.playerId);
			p.spentAnteCents += entry.amountCents ?? 0;
		}
	}

	for (const result of args.teamResults) {
		const sale = salesByTeam[result.teamId];
		const ownerId = sale ? resolvePlayerId(sale) : undefined;
		if (!sale || !ownerId) continue;

		const payoutByRound: Record<string, number> = {};
		let totalPayoutCents = 0;
		for (const key of orderedRoundKeys) {
			const outcome = result.roundResults[key];
			const isWin = outcome === "W";
			if (!isWin) continue;
			const pct = roundAlloc[key] ?? 0;
			const base =
				payoutBasis === "total_pot"
					? totalPotCents
					: sale.amountCents ?? 0;
			const amount = Math.floor(base * pct);
			payoutByRound[key] = amount;
			totalPayoutCents += amount;

			const player = ensurePlayer(ownerId);
			player.winningsByRound[key] = (player.winningsByRound[key] ?? 0) + amount;
			player.totalWinningsCents += amount;
		}

		teamPayouts.push({
			teamId: result.teamId,
			ownerPlayerId: ownerId,
			saleAmountCents: sale.amountCents ?? 0,
			payoutByRound,
			totalPayoutCents,
		});
	}

	for (const player of Object.values(winningsByPlayer)) {
		const spent = player.spentAnteCents + player.spentBidsCents;
		player.netCents = player.totalWinningsCents - spent;
	}

	return {
		totalPotCents:
			payoutBasis === "total_pot"
				? totalPotCents
				: computeTotalPotCents({
						sales,
						includeAnteInPot: ruleSet.includeAnteInPot ?? true,
						anteLedger,
					}),
		teamPayouts,
		playerPayouts: winningsByPlayer,
	};
}
