import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePlayerToken } from "@/lib/playerToken";

export const dynamic = "force-dynamic";

export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ eventId: string }> },
) {
	try {
		const { eventId } = await params;
		const players = await prisma.player.findMany({
			where: { eventId },
			orderBy: { name: "asc" },
		});
		const tokens = players.map((p) => ({
			playerId: p.id,
			name: p.name,
			handle: p.handle,
			token: generatePlayerToken(eventId, p.id),
		}));
		return NextResponse.json({ players: tokens });
	} catch (err) {
		console.error("player-links error", err);
		return NextResponse.json({ error: "Internal error" }, { status: 500 });
	}
}
