import { prisma } from "../../../../lib/prisma";
import { ResultsDashboard } from "../../../../components/ResultsDashboard";
import { buildOwnerBreakdown, buildResultsSummary, buildTopSales } from "../../../../lib/results";

export const dynamic = "force-dynamic";

async function getResultsData(eventId: string) {
	const [event, players, lots, sales, ledger, bidsAgg] = await prisma.$transaction([
		prisma.event.findUnique({
			where: { id: eventId },
			include: { ruleSet: true },
		}),
		prisma.player.findMany({ where: { eventId } }),
		prisma.lot.findMany({
			where: { eventId },
			include: { team: true },
			orderBy: { orderIndex: "asc" },
		}),
		prisma.sale.findMany({
			where: { eventId },
			include: { player: true, lot: { include: { team: true } } },
			orderBy: { finalizedAt: "desc" },
		}),
		prisma.ledgerEntry.findMany({ where: { eventId } }),
		prisma.bid.aggregate({
			where: { eventId },
			_sum: { amountCents: true },
		}),
	]);

	if (!event) return null;

	const summary = buildResultsSummary({
		lots,
		sales,
		ledger,
		ruleSet: event.ruleSet,
		allBidsCents: bidsAgg._sum.amountCents ?? 0,
	});

	const owners = buildOwnerBreakdown({
		players,
		sales,
	});

	const topSales = buildTopSales({ sales });

	const allTeams = lots.map((lot) => {
		const sale = sales.find((s) => s.lotId === lot.id);
		const owner = sale ? players.find((p) => p.id === sale.playerId) : null;
		return {
			teamName: lot.team.name,
			ownerName: owner?.name ?? null,
			priceCents: sale?.amountCents ?? null,
		};
	});

	return {
		event,
		ruleSet: event.ruleSet,
		summary,
		owners,
		topSales,
		allTeams,
	};
}

export default async function ResultsPage({
	params,
}: {
	params: Promise<{ eventId: string }>;
}) {
	const { eventId } = await params;
	const data = await getResultsData(eventId);
	if (!data) {
		return <div>Event not found</div>;
	}

	return (
		<ResultsDashboard
			eventId={eventId}
			eventName={data.event.name}
			summary={data.summary}
			owners={data.owners}
			topSales={data.topSales}
			roundAllocations={(data.ruleSet?.roundAllocations as any) ?? {}}
			allTeams={data.allTeams}
		/>
	);
}
