import { NextRequest, NextResponse } from "next/server";
import { validatePlayerToken } from "@/lib/playerToken";

export const dynamic = "force-dynamic";

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ eventId: string }> },
) {
	try {
		const { eventId } = await params;
		const { searchParams } = new URL(req.url);
		const playerId = searchParams.get("playerId");
		const token = searchParams.get("token");
		if (!playerId || !token) {
			return NextResponse.json({ ok: false, reason: "missing_params" }, { status: 400 });
		}
		const ok = validatePlayerToken({ eventId, playerId, token });
		if (!ok) {
			return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
		}
		return NextResponse.json({ ok: true });
	} catch (err) {
		console.error("player-validate error", err);
		return NextResponse.json({ ok: false, reason: "error" }, { status: 500 });
	}
}
