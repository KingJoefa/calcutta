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
		const [players, sales, ledger] = await Promise.all([
			prisma.player.findMany({ where: { eventId } }),
			prisma.sale.findMany({
				where: { eventId },
				include: { lot: { include: { team: true } }, player: true },
				orderBy: { finalizedAt: "asc" },
			}),
			prisma.ledgerEntry.findMany({ where: { eventId } }),
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

		const records = players.map((p) => ({
			Player: p.name,
			Handle: p.handle ?? "",
			"NFL Teams": teamsWonByPlayer[p.id].join("; "),
			SpentCents: purchasesByPlayer[p.id],
			AnteCents: anteByPlayer[p.id],
			NetOwedCents: purchasesByPlayer[p.id] + anteByPlayer[p.id],
		}));

		const csv = stringify(records, { header: true });
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


