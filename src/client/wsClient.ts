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

type StateLot = {
	id: string;
	status: "pending" | "open" | "sold";
	currentBidCents: number;
	highBidderId: string | null;
	acceptedBidderId?: string | null;
	closesAt: string | null;
	pausedAt?: string | null;
	pauseDurationSeconds?: number;
};

type StateBid = {
	id: string;
	lotId: string;
	playerId: string;
	playerName: string;
	amountCents: number;
	createdAt: string;
	teamName: string;
};

type StateResponse = {
	currentLot: StateLot | null;
	lots: Array<StateLot>;
	recentBids: Array<StateBid>;
	soldLots?: Array<{
		lotId: string;
		playerId: string;
		playerName: string;
		amountCents: number;
		teamName: string;
		soldAt: string;
	}>;
};

export function connectWs(
	eventId: string,
	onMessage: (msg: Message) => void,
	onStatusChange?: (status: ConnectionStatus) => void,
): WsConnection {
	// Vercel/serverless-friendly realtime:
	// - Use fast polling in production (reliable across instances)
	// - Use WebSocket only when NEXT_PUBLIC_WS_PORT is explicitly set (local dev)
	const usePolling = !process.env.NEXT_PUBLIC_WS_PORT;

	if (usePolling) {
		let currentStatus: ConnectionStatus = "connecting";
		let isClosed = false;
		let interval: NodeJS.Timeout | null = null;
		let last: {
			currentLotId: string | null;
			currentLotStatus: StateLot["status"] | null;
			currentBidCents: number | null;
			highBidderId: string | null;
			acceptedBidderId: string | null;
			closesAt: string | null;
			pausedAt: string | null;
			pauseDurationSeconds: number | null;
			recentBidIds: Set<string>;
		} | null = null;

		const updateStatus = (status: ConnectionStatus) => {
			currentStatus = status;
			onStatusChange?.(status);
		};

		const emit = (type: string, payload: unknown) => {
			onMessage({ type, eventId, payload, ts: Date.now() });
		};

		const pollOnce = async () => {
			try {
				const res = await fetch(`/api/events/${eventId}/state`, { cache: "no-store" as RequestCache });
				if (!res.ok) throw new Error(`state fetch failed: ${res.status}`);
				const state = (await res.json()) as StateResponse;

				if (currentStatus !== "connected") updateStatus("connected");

				const cur = state.currentLot;
				const curId = cur?.id ?? null;
				const curStatus = cur?.status ?? null;
				const curBid = cur?.currentBidCents ?? null;
				const curHigh = cur?.highBidderId ?? null;
				const curAccepted = (cur?.acceptedBidderId ?? null) as string | null;
				const curClosesAt = cur?.closesAt ?? null;
				const curPausedAt = (cur?.pausedAt ?? null) as string | null;
				const curPauseDur = (cur?.pauseDurationSeconds ?? null) as number | null;

				const bidIds = new Set<string>((state.recentBids ?? []).map((b) => b.id));

				if (!last) {
					last = {
						currentLotId: curId,
						currentLotStatus: curStatus,
						currentBidCents: curBid,
						highBidderId: curHigh,
						acceptedBidderId: curAccepted,
						closesAt: curClosesAt,
						pausedAt: curPausedAt,
						pauseDurationSeconds: curPauseDur,
						recentBidIds: bidIds,
					};
					return;
				}

				// lot opened: ONLY emit when the current lot is actually open.
				// Do NOT emit on lot-id change alone (pending lots become currentLot after a sale).
				if (
					curId &&
					curStatus === "open" &&
					(last.currentLotId !== curId || last.currentLotStatus !== "open")
				) {
					emit("lot_opened", { lotId: curId, open: true, closesAt: curClosesAt });
				}

				// timer pause/resume
				if (curId && last.currentLotId === curId) {
					if ((last.pausedAt ?? null) !== (curPausedAt ?? null)) {
						if (curPausedAt) {
							emit("timer_paused", { lotId: curId, pausedAt: curPausedAt, closesAt: curClosesAt, pauseDurationSeconds: curPauseDur });
						} else {
							emit("timer_resumed", { lotId: curId, pausedAt: null, closesAt: curClosesAt, pauseDurationSeconds: curPauseDur });
						}
					}
				}

				// bid accepted
				if (curId && last.currentLotId === curId && last.acceptedBidderId !== curAccepted && curAccepted) {
					emit("bid_accepted", { lotId: curId, playerId: curAccepted });
				}

				// new bids: emit any bid IDs we haven't seen yet, oldest->newest
				const newBids = (state.recentBids ?? []).filter((b) => !last!.recentBidIds.has(b.id)).reverse();
				for (const b of newBids) {
					emit("bid_placed", {
						lotId: b.lotId,
						playerId: b.playerId,
						amountCents: b.amountCents,
						closesAt: curClosesAt,
					});
				}

				// lot sold: detect previous open lot becoming sold in lots[]
				if (last.currentLotId && last.currentLotStatus === "open") {
					const prevLotId = last.currentLotId;
					const prevLot = state.lots.find((l) => l.id === prevLotId);
					if (prevLot?.status === "sold") {
						const sold = state.soldLots?.find((s) => s.lotId === prevLotId);
						emit("lot_sold", {
							lotId: prevLotId,
							playerId: sold?.playerId ?? prevLot.highBidderId,
							amountCents: sold?.amountCents ?? prevLot.currentBidCents,
							teamName: sold?.teamName,
							playerName: sold?.playerName,
							nextLotId: curId,
						});
					}
				}

				last = {
					currentLotId: curId,
					currentLotStatus: curStatus,
					currentBidCents: curBid,
					highBidderId: curHigh,
					acceptedBidderId: curAccepted,
					closesAt: curClosesAt,
					pausedAt: curPausedAt,
					pauseDurationSeconds: curPauseDur,
					recentBidIds: bidIds,
				};
			} catch {
				if (!isClosed) updateStatus(currentStatus === "connected" ? "reconnecting" : "disconnected");
			}
		};

		// start
		updateStatus("connecting");
		void pollOnce();
		interval = setInterval(pollOnce, 750);

		return {
			ws: null as any, // unused in polling mode; kept for compatibility
			get status() {
				return currentStatus;
			},
			close: () => {
				isClosed = true;
				if (interval) clearInterval(interval);
				interval = null;
				updateStatus("disconnected");
			},
		};
	}

	// Use WebSocket for local development
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


