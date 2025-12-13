// Server-Sent Events client (replacement for WebSocket)
// Works on Vercel free tier

export type Message = {
	type: string;
	eventId: string;
	payload: unknown;
	ts: number;
};

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

export type SseConnection = {
	ws: EventSource; // For compatibility with WsConnection interface
	close: () => void;
	status: ConnectionStatus;
};

const MAX_RECONNECT_DELAY = 30000; // 30 seconds max
const INITIAL_RECONNECT_DELAY = 1000; // Start with 1 second

export function connectSse(
	eventId: string,
	onMessage: (msg: Message) => void,
	onStatusChange?: (status: ConnectionStatus) => void,
): SseConnection {
	let reconnectDelay = INITIAL_RECONNECT_DELAY;
	let reconnectTimeout: NodeJS.Timeout | null = null;
	let isIntentionallyClosed = false;
	let currentEventSource: EventSource | null = null;
	let currentStatus: ConnectionStatus = "connecting";
	let lastEventTs: number | null = null;

	const updateStatus = (status: ConnectionStatus) => {
		currentStatus = status;
		onStatusChange?.(status);
	};

	const connect = (): EventSource => {
		updateStatus(currentStatus === "disconnected" ? "reconnecting" : "connecting");
		
		const url = `/api/events/${eventId}/stream${lastEventTs ? `?since=${lastEventTs}` : ""}`;
		const eventSource = new EventSource(url);

		eventSource.onopen = () => {
			reconnectDelay = INITIAL_RECONNECT_DELAY; // Reset delay on successful connection
			updateStatus("connected");
		};

		eventSource.onmessage = (ev) => {
			try {
				if (ev.data.startsWith(":")) {
					// Comment/keepalive message, ignore
					return;
				}
				const data = JSON.parse(ev.data) as Message;
				lastEventTs = data.ts;
				onMessage(data);
			} catch (err) {
				console.error("Error parsing SSE message:", err);
			}
		};

		eventSource.onerror = () => {
			eventSource.close();
			currentEventSource = null;

			// Don't reconnect if intentionally closed or if it's a normal closure
			if (isIntentionallyClosed) {
				updateStatus("disconnected");
				return;
			}

			// Attempt to reconnect with exponential backoff
			updateStatus("reconnecting");
			reconnectTimeout = setTimeout(() => {
				if (!isIntentionallyClosed) {
					currentEventSource = connect();
				}
			}, reconnectDelay);

			// Exponential backoff: double the delay, capped at MAX_RECONNECT_DELAY
			reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
		};

		return eventSource;
	};

	currentEventSource = connect();

	return {
		ws: currentEventSource as any, // For compatibility with WsConnection interface
		get status() {
			return currentStatus;
		},
		close: () => {
			isIntentionallyClosed = true;
			if (reconnectTimeout) {
				clearTimeout(reconnectTimeout);
				reconnectTimeout = null;
			}
			if (currentEventSource) {
				currentEventSource.close();
				currentEventSource = null;
			}
			updateStatus("disconnected");
		},
	};
}

