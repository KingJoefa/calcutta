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
		
		// Find the most recent non-reversal ledger entry to determine what to undo
		const lastLedgerEntry = await prisma.ledgerEntry.findFirst({
			where: { 
				eventId,
				type: { not: "reversal" }, // Skip reversal entries
			},
			orderBy: { createdAt: "desc" },
		});

		// If most recent ledger entry is a sale, undo the sale
		if (lastLedgerEntry && lastLedgerEntry.type === "sale") {
			// Undo a sale
			const sale = await prisma.sale.findUnique({
				where: { id: lastLedgerEntry.refId! },
				include: { lot: true },
			});

			if (!sale) {
				return NextResponse.json({ error: "Sale not found" }, { status: 400 });
			}

			await prisma.$transaction(async (tx) => {
				// Create reversal ledger entry
				await tx.ledgerEntry.create({
					data: {
						eventId,
						playerId: sale.playerId,
						type: "reversal",
						amountCents: -sale.amountCents,
						note: `Undo sale ${sale.id}`,
						refId: sale.id,
					},
				});

				// Delete the sale
				await tx.sale.delete({ where: { id: sale.id } });

				// Restore lot to "open" with the same bid that was sold
				// This restores it back to the high bid state before sale
				await tx.lot.update({
					where: { id: sale.lotId },
					data: {
						status: "open",
						currentBidCents: sale.amountCents,
						highBidderId: sale.playerId,
						acceptedBidderId: null, // Clear accepted bidder
					},
				});
			});

			// Check if this was the most recent sale (to determine if it should become current lot)
			const isMostRecentSale = !await prisma.sale.findFirst({
				where: {
					eventId,
					id: { not: sale.id },
					finalizedAt: { gt: sale.finalizedAt },
				},
			});

			getWsServer().broadcast(eventId, "undo_last", { 
				type: "sale",
				saleId: sale.id,
				lotId: sale.lotId,
				shouldBecomeCurrentLot: isMostRecentSale,
			});
			return NextResponse.json({ ok: true, type: "sale", saleId: sale.id });
		}

		// No sale to undo, so undo the most recent bid
		const lastBid = await prisma.bid.findFirst({
			where: { eventId },
			orderBy: { createdAt: "desc" },
		});

		if (!lastBid) {
			return NextResponse.json({ error: "Nothing to undo" }, { status: 400 });
		}

		const lot = await prisma.lot.findUnique({
			where: { id: lastBid.lotId },
		});

		if (!lot || lot.status !== "open") {
			return NextResponse.json({ error: "Cannot undo bid - lot is not open" }, { status: 400 });
		}

		// Find the previous bid for this lot
		const previousBid = await prisma.bid.findFirst({
			where: {
				lotId: lastBid.lotId,
				id: { not: lastBid.id },
			},
			orderBy: { createdAt: "desc" },
		});

		await prisma.$transaction(async (tx) => {
			// Delete the last bid
			await tx.bid.delete({ where: { id: lastBid.id } });

			// Restore lot to previous bid state or reset if no previous bid
			if (previousBid) {
				await tx.lot.update({
					where: { id: lastBid.lotId },
					data: {
						currentBidCents: previousBid.amountCents,
						highBidderId: previousBid.playerId,
						acceptedBidderId: null, // Clear accepted bidder when undoing
					},
				});
			} else {
				// No previous bid, reset to initial state
				await tx.lot.update({
					where: { id: lastBid.lotId },
					data: {
						currentBidCents: 0,
						highBidderId: null,
						acceptedBidderId: null,
					},
				});
			}
		});

		getWsServer().broadcast(eventId, "undo_last", { 
			type: "bid",
			bidId: lastBid.id,
			lotId: lastBid.lotId,
		});
		return NextResponse.json({ ok: true, type: "bid", bidId: lastBid.id });
	} catch (err) {
		console.error("Error undoing:", err);
		const errorMessage = err instanceof Error ? err.message : "Internal error";
		return NextResponse.json({ 
			error: errorMessage,
			details: process.env.NODE_ENV === "development" ? String(err) : undefined
		}, { status: 500 });
	}
}


