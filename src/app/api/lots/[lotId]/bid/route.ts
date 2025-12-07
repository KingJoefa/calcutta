import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWsServer } from "@/server/wsServer";
import { computeAntiSnipeExtension } from "@/lib/antiSnipe";

export const dynamic = "force-dynamic";

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ lotId: string }> },
) {
	try {
		const { playerId, amountCents } = await req.json();
		if (!playerId || !Number.isInteger(amountCents)) {
			return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
		}
		const { lotId } = await params;
		const lot = await prisma.lot.findUnique({
			where: { id: lotId },
			include: {
				event: { include: { ruleSet: true } },
			},
		});
		if (!lot || lot.status !== "open") {
			return NextResponse.json({ error: "Lot not open" }, { status: 400 });
		}
		const minIncrement = lot.event.ruleSet?.minIncrementCents ?? 100;
		const nextMin = Math.max(0, lot.currentBidCents) + minIncrement;
		if (amountCents < nextMin) {
			return NextResponse.json(
				{ error: `Bid must be at least $${(nextMin / 100).toFixed(2)} (current bid: $${(lot.currentBidCents / 100).toFixed(2)}, minimum increment: $${(minIncrement / 100).toFixed(2)})` },
				{ status: 400 },
			);
		}

		const bid = await prisma.$transaction(async (tx) => {
			const created = await tx.bid.create({
				data: {
					eventId: lot.eventId,
					lotId: lot.id,
					playerId,
					amountCents,
				},
			});
			// Anti-snipe extension
			const nowMs = Date.now();
			const closesAtMs = lot.closesAt ? new Date(lot.closesAt).getTime() : nowMs;
			const rs = lot.event.ruleSet!;
			const { shouldExtend, newClosesAtMs } = computeAntiSnipeExtension({
				nowMs,
				closesAtMs,
				antiSnipeWindowSeconds: rs.antiSnipeExtensionSeconds,
				extendBySeconds: rs.antiSnipeExtensionSeconds,
			});
			await tx.lot.update({
				where: { id: lot.id },
				data: {
					currentBidCents: amountCents,
					highBidderId: playerId,
					closesAt: new Date(shouldExtend ? newClosesAtMs : closesAtMs),
				},
			});
			return created;
		});

		const updatedLot = await prisma.lot.findUnique({
			where: { id: lot.id },
		});
		
		getWsServer().broadcast(lot.eventId, "bid_placed", {
			lotId: lot.id,
			playerId,
			amountCents,
			closesAt: updatedLot?.closesAt?.toISOString(),
		});
		return NextResponse.json({ ok: true, bidId: bid.id });
	} catch (err) {
		console.error(err);
		return NextResponse.json({ error: "Internal error" }, { status: 500 });
	}
}


