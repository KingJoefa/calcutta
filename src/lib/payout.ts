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
	ruleSet: Pick<RuleSet, "roundAllocations">;
	sales: PayoutSale[];
	roundKeysOrder?: string[];
}): Record<string, PayoutProjection> {
	const { ruleSet, sales } = args;
	const roundAlloc = (ruleSet.roundAllocations ?? {}) as Record<string, number>;
	const orderedRoundKeys = args.roundKeysOrder ?? Object.keys(roundAlloc);

	const projectionByPlayer: Record<string, PayoutProjection> = {};

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
			const amount = Math.floor(sale.amountCents * pct);
			cumulative += amount;
			proj.byTeam[teamId].amountCentsByRound[key] = amount;
		}
		proj.totalPotentialCents += cumulative;
	}

	return projectionByPlayer;
}

