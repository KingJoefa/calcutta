export type Message = {
	type: string;
	eventId: string;
	payload: unknown;
	ts: number;
};

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

export type WsConnection = {
	ws: WebSocket;
	status: ConnectionStatus;
	close: () => void;
};

const MAX_RECONNECT_DELAY = 30000; // 30 seconds max
const INITIAL_RECONNECT_DELAY = 1000; // Start with 1 second

export function connectWs(
	eventId: string,
	onMessage: (msg: Message) => void,
	onStatusChange?: (status: ConnectionStatus) => void,
): WsConnection {
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

	let reconnectDelay = INITIAL_RECONNECT_DELAY;
	let reconnectTimeout: NodeJS.Timeout | null = null;
	let isIntentionallyClosed = false;
	let currentWs: WebSocket | null = null;
	let currentStatus: ConnectionStatus = "connecting";

	const updateStatus = (status: ConnectionStatus) => {
		currentStatus = status;
		onStatusChange?.(status);
	};

	const connect = (): WebSocket => {
		updateStatus(currentStatus === "disconnected" ? "reconnecting" : "connecting");
		const ws = new WebSocket(url);

		ws.onopen = () => {
			reconnectDelay = INITIAL_RECONNECT_DELAY; // Reset delay on successful connection
			updateStatus("connected");
		};

		ws.onmessage = (ev) => {
			try {
				const data = JSON.parse(ev.data as string) as Message;
				onMessage(data);
			} catch {
				// ignore
			}
		};

		ws.onerror = () => {
			// Errors are handled by onclose
		};

		ws.onclose = (event) => {
			currentWs = null;
			
			// Don't reconnect if intentionally closed or if it's a normal closure
			if (isIntentionallyClosed || event.code === 1000) {
				updateStatus("disconnected");
				return;
			}

			// Attempt to reconnect with exponential backoff
			updateStatus("reconnecting");
			reconnectTimeout = setTimeout(() => {
				if (!isIntentionallyClosed) {
					currentWs = connect();
				}
			}, reconnectDelay);

			// Exponential backoff: double the delay, capped at MAX_RECONNECT_DELAY
			reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
		};

		return ws;
	};

	currentWs = connect();

	return {
		ws: currentWs,
		get status() {
			return currentStatus;
		},
		close: () => {
			isIntentionallyClosed = true;
			if (reconnectTimeout) {
				clearTimeout(reconnectTimeout);
				reconnectTimeout = null;
			}
			if (currentWs) {
				currentWs.close(1000); // Normal closure
				currentWs = null;
			}
			updateStatus("disconnected");
		},
	};
}


