import { NextResponse } from "next/server";
import { getWsServer } from "@/server/wsServer";

export const dynamic = "force-dynamic";

export async function GET() {
	// Initialize the server (for WebSocket) or just return ok (for SSE)
	getWsServer();
	return NextResponse.json({ ok: true, mode: process.env.NEXT_PUBLIC_WS_PORT ? "websocket" : "sse" });
}


