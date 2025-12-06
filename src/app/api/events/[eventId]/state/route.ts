import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ eventId: string }> },
) {
	try {
		const { eventId } = await params;
		const [event, players, lots, bids] = await Promise.all([
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
			prisma.bid.findMany({
				where: { eventId },
				include: { player: true, lot: { include: { team: true } } },
				orderBy: { createdAt: "desc" },
				take: 50, // Last 50 bids
			}),
		]);

		if (!event) {
			return NextResponse.json({ error: "Event not found" }, { status: 404 });
		}

		const currentLot =
			lots.find((l) => l.status === "open") ??
			lots.find((l) => l.status === "pending");

		return NextResponse.json({
			event: {
				id: event.id,
				name: event.name,
				status: event.status,
			},
			ruleSet: event.ruleSet,
			players: players.map((p) => ({
				id: p.id,
				name: p.name,
				handle: p.handle,
			})),
			lots: lots.map((l) => ({
				id: l.id,
				orderIndex: l.orderIndex,
				status: l.status,
				currentBidCents: l.currentBidCents,
				highBidderId: l.highBidderId,
				openedAt: l.openedAt?.toISOString(),
				closesAt: l.closesAt?.toISOString(),
				team: {
					id: l.team.id,
					name: l.team.name,
					seed: l.team.seed,
					region: l.team.region,
					bracket: l.team.bracket,
				},
			})),
			currentLot: currentLot
				? {
						id: currentLot.id,
						orderIndex: currentLot.orderIndex,
						status: currentLot.status,
						currentBidCents: currentLot.currentBidCents,
						highBidderId: currentLot.highBidderId,
						openedAt: currentLot.openedAt?.toISOString(),
						closesAt: currentLot.closesAt?.toISOString(),
						team: {
							id: currentLot.team.id,
							name: currentLot.team.name,
							seed: currentLot.team.seed,
							region: currentLot.team.region,
							bracket: currentLot.team.bracket,
						},
					}
				: null,
			recentBids: bids.map((b) => ({
				id: b.id,
				lotId: b.lotId,
				playerId: b.playerId,
				playerName: b.player.name,
				amountCents: b.amountCents,
				createdAt: b.createdAt.toISOString(),
				teamName: b.lot.team.name,
			})),
		});
	} catch (err) {
		console.error(err);
		return NextResponse.json({ error: "Internal error" }, { status: 500 });
	}
}

