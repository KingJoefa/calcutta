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
		const lot = await prisma.lot.update({
			where: { id: lotId },
			data: {
				status: "open",
				openedAt: new Date(),
				closesAt: new Date(Date.now() + 30_000), // default 30s; will be reset by ruleSet on bid
			},
			include: { event: true, team: true },
		});
		getWsServer().broadcast(lot.eventId, "lot_opened", {
			lotId: lot.id,
			open: true,
			closesAt: lot.closesAt?.toISOString(),
		});
		return NextResponse.json({ ok: true, lotId: lot.id });
	} catch (err) {
		console.error(err);
		return NextResponse.json({ error: "Internal error" }, { status: 500 });
	}
}


