// WebSocket server wrapper for compatibility
// Uses event broadcaster (SSE) for Vercel compatibility
import { broadcast as eventBroadcast } from "./eventBroadcaster";
import type { WebSocket as WsWebSocket } from "ws";

// For local development, optionally use WebSocket server
// For Vercel production, use SSE (eventBroadcaster)
const USE_WEBSOCKET = process.env.NEXT_PUBLIC_WS_PORT && process.env.NODE_ENV === "development";

let wsServer: {
	broadcast: (eventId: string, type: string, payload: unknown) => void;
} | null = null;

if (USE_WEBSOCKET) {
	// Only create WebSocket server in development with WS_PORT set
	try {
		const WebSocket = require("ws");
		const http = require("http");
		const { WebSocketServer } = WebSocket;
		
		const port = Number(process.env.NEXT_PUBLIC_WS_PORT ?? 4000);
		const httpServer = http.createServer();
		const wss = new WebSocketServer({ server: httpServer });

		// Use ws' WebSocket type (NOT the browser WebSocket type)
		type Client = WsWebSocket & { eventId?: string };

		wss.on("connection", (ws: Client, req: any) => {
			try {
				const url = new URL(req.url ?? "", "http://localhost");
				const eventId = url.searchParams.get("eventId") ?? undefined;
				(ws as Client).eventId = eventId;
			} catch {
				// ignore
			}

			ws.on("message", (_msg: unknown) => {
				// No-op for now
			});
		});

		httpServer.listen(port);

		const broadcast = (eventId: string, type: string, payload: unknown) => {
			const message = JSON.stringify({ type, eventId, payload, ts: Date.now() });
			const OPEN = 1; // ws.WebSocket.OPEN
			wss.clients.forEach((client: WsWebSocket) => {
				const c = client as Client;
				if (c.readyState === OPEN && c.eventId === eventId) {
					c.send(message);
				}
			});
			// Also broadcast via event broadcaster for SSE clients
			eventBroadcast(eventId, type, payload);
		};

		wsServer = { broadcast };
	} catch (err) {
		console.warn("WebSocket server not available, using SSE only:", err);
	}
}

export function getWsServer() {
	if (wsServer) {
		return wsServer;
	}
	// Return SSE-based broadcaster
	return {
		broadcast: eventBroadcast,
	};
}


