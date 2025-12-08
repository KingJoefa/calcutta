import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stringify } from "csv-stringify/sync";

export const dynamic = "force-dynamic";

export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ eventId: string }> },
) {
	try {
		const { eventId } = await params;
		const [players, sales, ledger, bids] = await Promise.all([
			prisma.player.findMany({ where: { eventId } }),
			prisma.sale.findMany({
				where: { eventId },
				include: { lot: { include: { team: true } }, player: true },
				orderBy: { finalizedAt: "asc" },
			}),
			prisma.ledgerEntry.findMany({ where: { eventId } }),
			prisma.bid.findMany({
				where: { eventId },
				include: { 
					player: true,
					lot: { include: { team: true } }
				},
				orderBy: { createdAt: "asc" },
			}),
		]);

		const purchasesByPlayer: Record<string, number> = {};
		const anteByPlayer: Record<string, number> = {};
		const teamsWonByPlayer: Record<string, string[]> = {};

		for (const player of players) {
			purchasesByPlayer[player.id] = 0;
			anteByPlayer[player.id] = 0;
			teamsWonByPlayer[player.id] = [];
		}
		for (const sale of sales) {
			purchasesByPlayer[sale.playerId] += sale.amountCents;
			teamsWonByPlayer[sale.playerId].push(sale.lot.team.name);
		}
		for (const le of ledger) {
			if (le.type === "ante" && le.playerId) {
				anteByPlayer[le.playerId] += le.amountCents;
			}
		}

		const summaryRecords = players.map((p) => {
			const totalSpent = purchasesByPlayer[p.id] / 100;
			const antePaid = anteByPlayer[p.id] / 100;
			const netOwed = totalSpent + antePaid;
			return {
				Player: p.name,
				Handle: p.handle ?? "",
				"Teams Won": teamsWonByPlayer[p.id].join("; "),
				"Total Spent": totalSpent.toFixed(2),
				"Ante Paid": antePaid.toFixed(2),
				"Net Amount Owed": netOwed.toFixed(2),
			};
		});

		// Create a map of winning bid IDs
		// A winning bid is the final bid that resulted in a sale
		// For each sale, find the last bid that matches the sale criteria (lot, player, amount)
		const winningBidIds = new Set<string>();
		for (const sale of sales) {
			// Find all bids for this lot that match the sale amount and player
			const matchingBids = bids
				.filter(bid => 
					bid.lotId === sale.lotId && 
					bid.amountCents === sale.amountCents && 
					bid.playerId === sale.playerId
				)
				.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); // Most recent first
			
			// The winning bid is the most recent bid that matches (should be the last one before sale)
			if (matchingBids.length > 0) {
				winningBidIds.add(matchingBids[0].id);
			}
		}

		// Create bid ledger records
		const bidRecords = bids.map((bid) => {
			const isWinningBid = winningBidIds.has(bid.id);
			return {
				Time: bid.createdAt.toISOString(),
				Player: bid.player.name,
				Team: bid.lot.team.name,
				Amount: (bid.amountCents / 100).toFixed(2),
				"✓": isWinningBid ? "✓" : "",
			};
		});

		// Combine summary and bid ledger with separator
		const summaryCsv = stringify(summaryRecords, { header: true });
		const bidLedgerCsv = stringify(bidRecords, { header: true });
		
		// Combine with empty rows for visual separation
		// The bid ledger has its own header row, so it will be clear where it starts
		const csv = summaryCsv + "\n\n" + bidLedgerCsv;
		
		return new NextResponse(csv, {
			headers: {
				"content-type": "text/csv",
				"content-disposition": `attachment; filename=\"recap-${eventId}.csv\"`,
			},
		});
	} catch (err) {
		console.error(err);
		return NextResponse.json({ error: "Internal error" }, { status: 500 });
	}
}


