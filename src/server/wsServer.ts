import WebSocket, { WebSocketServer } from "ws";
import http from "http";

type Client = WebSocket & { eventId?: string };

declare global {
	// eslint-disable-next-line no-var
	var __calcuttaWsServer: {
		server: WebSocketServer;
		httpServer: http.Server;
		broadcast: (eventId: string, type: string, payload: unknown) => void;
	} | null;
}

function createServer() {
	const port = Number(process.env.NEXT_PUBLIC_WS_PORT ?? 4000);
	const httpServer = http.createServer();
	const wss = new WebSocketServer({ server: httpServer });

	wss.on("connection", (ws: Client, req) => {
		try {
			const url = new URL(req.url ?? "", "http://localhost");
			const eventId = url.searchParams.get("eventId") ?? undefined;
			(ws as Client).eventId = eventId;
		} catch {
			// ignore
		}

		ws.on("message", (_msg) => {
			// No-op for now
		});
	});

	httpServer.listen(port);

	const broadcast = (eventId: string, type: string, payload: unknown) => {
		const message = JSON.stringify({ type, eventId, payload, ts: Date.now() });
		wss.clients.forEach((client) => {
			const c = client as Client;
			if (c.readyState === WebSocket.OPEN && c.eventId === eventId) {
				c.send(message);
			}
		});
	};

	return { server: wss, httpServer, broadcast };
}

export function getWsServer() {
	if (!global.__calcuttaWsServer) {
		global.__calcuttaWsServer = createServer();
	}
	return global.__calcuttaWsServer;
}


