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
			include: { 
				event: { include: { ruleSet: true } },
				team: true,
			},
		});
		if (!lot || lot.status !== "open") {
			return NextResponse.json({ error: "Lot not open" }, { status: 400 });
		}
		if (!lot.highBidderId) {
			return NextResponse.json({ error: "No bid to accept" }, { status: 400 });
		}

		// Get the winning bid info
		const winningBid = await prisma.bid.findFirst({
			where: {
				lotId: lot.id,
				playerId: lot.highBidderId,
				amountCents: lot.currentBidCents,
			},
			orderBy: { createdAt: "desc" },
			include: { player: true },
		});

		// Find the next pending lot
		const nextLot = await prisma.lot.findFirst({
			where: {
				eventId: lot.eventId,
				status: "pending",
			},
			include: { team: true },
			orderBy: { orderIndex: "asc" },
		});

		// Accept bid and finalize sale in one transaction
		const result = await prisma.$transaction(async (tx) => {
			// Create the sale
			const sale = await tx.sale.create({
				data: {
					eventId: lot.eventId,
					lotId: lot.id,
					playerId: lot.highBidderId,
					amountCents: lot.currentBidCents,
				},
			});

			// Mark lot as sold and set accepted bidder
			const updatedLot = await tx.lot.update({
				where: { id: lot.id },
				data: {
					status: "sold",
					acceptedBidderId: lot.highBidderId,
				},
			});

			// Create ledger entry
			await tx.ledgerEntry.create({
				data: {
					eventId: lot.eventId,
					playerId: lot.highBidderId,
					type: "sale",
					amountCents: lot.currentBidCents,
					note: `Sale for lot ${lot.id}`,
					refId: sale.id,
				},
			});

			return { sale, lot: updatedLot };
		});

		// Broadcast lot sold event
		getWsServer().broadcast(lot.eventId, "lot_sold", {
			lotId: lot.id,
			saleId: result.sale.id,
			playerId: lot.highBidderId,
			amountCents: lot.currentBidCents,
			teamName: lot.team.name,
			playerName: winningBid?.player.name ?? "Unknown",
			nextLotId: nextLot?.id ?? null,
		});
		
		return NextResponse.json({ 
			ok: true, 
			lotId: result.lot.id,
			saleId: result.sale.id,
			nextLotId: nextLot?.id ?? null,
		});
	} catch (err) {
		console.error("Error accepting bid:", err);
		const errorMessage = err instanceof Error ? err.message : "Internal error";
		return NextResponse.json({ 
			error: errorMessage,
			details: process.env.NODE_ENV === "development" ? String(err) : undefined
		}, { status: 500 });
	}
}

