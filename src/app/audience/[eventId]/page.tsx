import { prisma } from "../../../lib/prisma";
import { AudienceView } from "../../../components/AudienceView";

export const dynamic = "force-dynamic";

async function getAuctionState(eventId: string) {
	const [event, players, lots] = await Promise.all([
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
	]);

	if (!event) {
		return null;
	}

	const currentLot =
		lots.find((l) => l.status === "open") ??
		lots.find((l) => l.status === "pending");
	
	const sales = await prisma.sale.findMany({
		where: { eventId },
		include: { player: true, lot: { include: { team: true } } },
		orderBy: { finalizedAt: "desc" },
	});

	return {
		event: {
			id: event.id,
			name: event.name,
			status: event.status,
		},
		ruleSet: event.ruleSet,
		players: players.map((p) => ({
			id: p.id,
			name: p.name,
		})),
		soldLots: sales.map((s) => ({
			lotId: s.lotId,
			teamName: s.lot.team.name,
			playerId: s.playerId,
			playerName: s.player.name,
			amountCents: s.amountCents,
			soldAt: s.finalizedAt.toISOString(),
		})),
		currentLot: currentLot
			? {
					id: currentLot.id,
					orderIndex: currentLot.orderIndex,
					status: currentLot.status,
					currentBidCents: currentLot.currentBidCents,
					highBidderId: currentLot.highBidderId,
					openedAt: currentLot.openedAt?.toISOString() ?? null,
					closesAt: currentLot.closesAt?.toISOString() ?? null,
					pausedAt: currentLot.pausedAt?.toISOString() ?? null,
					pauseDurationSeconds: currentLot.pauseDurationSeconds,
					team: {
						id: currentLot.team.id,
						name: currentLot.team.name,
						seed: currentLot.team.seed,
						region: currentLot.team.region,
						bracket: currentLot.team.bracket,
					},
				}
			: null,
	};
}

export default async function AudiencePage({
	params,
}: {
	params: Promise<{ eventId: string }>;
}) {
	const { eventId } = await params;
	const initialState = await getAuctionState(eventId);
	
	if (!initialState) {
		return <div>Event not found</div>;
	}

	return <AudienceView eventId={eventId} initialState={initialState} />;
}


