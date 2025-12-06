export type Message = {
	type: string;
	eventId: string;
	payload: unknown;
	ts: number;
};

export function connectWs(eventId: string, onMessage: (msg: Message) => void) {
	const port = process.env.NEXT_PUBLIC_WS_PORT || "4000";
	const protocol =
		typeof window !== "undefined" && window.location.protocol === "https:"
			? "wss"
			: "ws";
	const host =
		typeof window !== "undefined"
			? window.location.hostname
			: "localhost";
	const url = `${protocol}://${host}:${port}/?eventId=${eventId}`;
	const ws = new WebSocket(url);
	ws.onmessage = (ev) => {
		try {
			const data = JSON.parse(ev.data as string) as Message;
			onMessage(data);
		} catch {
			// ignore
		}
	};
	return ws;
}


