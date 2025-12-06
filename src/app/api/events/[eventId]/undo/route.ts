import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWsServer } from "@/server/wsServer";

export const dynamic = "force-dynamic";

export async function POST(
	_req: NextRequest,
	{ params }: { params: Promise<{ eventId: string }> },
) {
	try {
		const { eventId } = await params;
		// Find the last sale for this event
		const lastSale = await prisma.sale.findFirst({
			where: { eventId },
			orderBy: { finalizedAt: "desc" },
		});
		if (!lastSale) {
			return NextResponse.json({ error: "Nothing to undo" }, { status: 400 });
		}
		await prisma.$transaction(async (tx) => {
			await tx.ledgerEntry.create({
				data: {
					eventId,
					playerId: lastSale.playerId,
					type: "reversal",
					amountCents: -lastSale.amountCents,
					note: `Undo sale ${lastSale.id}`,
					refId: lastSale.id,
				},
			});
			await tx.lot.update({
				where: { id: lastSale.lotId },
				data: {
					status: "open",
					currentBidCents: 0,
					highBidderId: null,
				},
			});
			await tx.sale.delete({ where: { id: lastSale.id } });
		});

		getWsServer().broadcast(eventId, "undo_last", { saleId: lastSale.id });
		return NextResponse.json({ ok: true });
	} catch (err) {
		console.error(err);
		return NextResponse.json({ error: "Internal error" }, { status: 500 });
	}
}


