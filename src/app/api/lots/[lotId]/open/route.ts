import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWsServer } from "@/server/wsServer";

export const dynamic = "force-dynamic";

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ lotId: string }> },
) {
	try {
		const { lotId } = await params;
		const { playerId, openingBidCents } = await req.json();
		
		if (!playerId || !Number.isInteger(openingBidCents)) {
			return NextResponse.json({ error: "Player ID and opening bid amount are required" }, { status: 400 });
		}
		
		const lot = await prisma.lot.findUnique({
			where: { id: lotId },
			include: { 
				event: { include: { ruleSet: true } },
				team: true 
			},
		});
		
		if (!lot) {
			return NextResponse.json({ error: "Team not found" }, { status: 404 });
		}
		
		if (lot.status !== "pending") {
			return NextResponse.json({ 
				error: `Team is already ${lot.status === "open" ? "open for bidding" : "sold"}. Please refresh the page to see the current status.` 
			}, { status: 400 });
		}
		
		if (!lot.event.ruleSet) {
			return NextResponse.json({ error: "Event ruleSet not found. Please configure auction settings." }, { status: 400 });
		}
		
		// Validate opening bid is at least the minimum increment
		const minBid = lot.event.ruleSet.minIncrementCents;
		if (openingBidCents < minBid) {
			return NextResponse.json({ 
				error: `Opening bid must be at least $${(minBid / 100).toFixed(2)}` 
			}, { status: 400 });
		}
		
		// Verify player exists
		const player = await prisma.player.findUnique({
			where: { id: playerId },
		});
		
		if (!player || player.eventId !== lot.eventId) {
			return NextResponse.json({ error: "Invalid player" }, { status: 400 });
		}
		
		const timerSeconds = lot.event.ruleSet.auctionTimerSeconds ?? 30;
		const closesAt = new Date(Date.now() + timerSeconds * 1000);
		
		// Open the team and create the opening bid in a transaction
		const result = await prisma.$transaction(async (tx) => {
			// Create the opening bid
			const bid = await tx.bid.create({
				data: {
					eventId: lot.eventId,
					lotId: lot.id,
					playerId,
					amountCents: openingBidCents,
				},
			});
			
			// Open the lot with the opening bid
			const updatedLot = await tx.lot.update({
				where: { id: lotId },
				data: {
					status: "open",
					openedAt: new Date(),
					closesAt,
					currentBidCents: openingBidCents,
					highBidderId: playerId,
					// Note: acceptedBidderId will be set to null by default if the field exists
					// If you get an error about this field, run: npx prisma migrate dev --name add_accepted_bidder_id
				},
			});
			
			return { bid, lot: updatedLot };
		});
		
		// Broadcast lot opened and bid placed events
		try {
			getWsServer().broadcast(lot.eventId, "lot_opened", {
				lotId: result.lot.id,
				open: true,
				closesAt: result.lot.closesAt?.toISOString(),
			});
			
			getWsServer().broadcast(lot.eventId, "bid_placed", {
				lotId: result.lot.id,
				playerId,
				amountCents: openingBidCents,
				closesAt: result.lot.closesAt?.toISOString(),
			});
		} catch (wsErr) {
			console.error("WebSocket broadcast error:", wsErr);
			// Don't fail the request if WebSocket fails
		}
		
		return NextResponse.json({ ok: true, lotId: result.lot.id, bidId: result.bid.id });
	} catch (err) {
		console.error("Error opening team:", err);
		const errorMessage = err instanceof Error ? err.message : "Internal error";
		return NextResponse.json({ 
			error: errorMessage,
			details: process.env.NODE_ENV === "development" ? String(err) : undefined
		}, { status: 500 });
	}
}


