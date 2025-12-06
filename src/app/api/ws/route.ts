import { NextResponse } from "next/server";
import { getWsServer } from "@/server/wsServer";

export const dynamic = "force-dynamic";

export async function GET() {
	getWsServer();
	return NextResponse.json({ ok: true });
}


