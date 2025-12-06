import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWsServer } from "@/server/wsServer";

export const dynamic = "force-dynamic";

export async function POST(
	_req: NextRequest,
	{ params }: { params: Promise<{ lotId: string }> },
) {
	try {
		const { lotId } = await params;
		const lot = await prisma.lot.findUnique({
			where: { id: lotId },
			include: { event: true },
		});
		if (!lot || lot.status !== "open" || !lot.highBidderId) {
			return NextResponse.json({ error: "Lot not sellable" }, { status: 400 });
		}
		const sale = await prisma.$transaction(async (tx) => {
			const sold = await tx.sale.create({
				data: {
					eventId: lot.eventId,
					lotId: lot.id,
					playerId: lot.highBidderId!,
					amountCents: lot.currentBidCents,
				},
			});
			await tx.lot.update({
				where: { id: lot.id },
				data: { status: "sold" },
			});
			await tx.ledgerEntry.create({
				data: {
					eventId: lot.eventId,
					playerId: lot.highBidderId!,
					type: "sale",
					amountCents: lot.currentBidCents,
					note: `Sale for lot ${lot.id}`,
					refId: sold.id,
				},
			});
			return sold;
		});
		getWsServer().broadcast(lot.eventId, "lot_sold", {
			lotId: lot.id,
			saleId: sale.id,
		});
		return NextResponse.json({ ok: true, saleId: sale.id });
	} catch (err) {
		console.error(err);
		return NextResponse.json({ error: "Internal error" }, { status: 500 });
	}
}


