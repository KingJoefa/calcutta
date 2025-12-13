// Event broadcaster for Server-Sent Events (SSE)
// Works on Vercel serverless functions

type EventMessage = {
	type: string;
	eventId: string;
	payload: unknown;
	ts: number;
};

type EventListener = (message: EventMessage) => void;

// In-memory event store (works for single instance, which is fine for free tier)
const eventListeners = new Map<string, Set<EventListener>>();

// Store recent events for new connections (last 100 events per eventId)
const recentEvents = new Map<string, EventMessage[]>();
const MAX_RECENT_EVENTS = 100;

export function broadcast(eventId: string, type: string, payload: unknown) {
	const message: EventMessage = {
		type,
		eventId,
		payload,
		ts: Date.now(),
	};

	// Store recent event
	if (!recentEvents.has(eventId)) {
		recentEvents.set(eventId, []);
	}
	const events = recentEvents.get(eventId)!;
	events.push(message);
	if (events.length > MAX_RECENT_EVENTS) {
		events.shift();
	}

	// Broadcast to all listeners for this event
	const listeners = eventListeners.get(eventId);
	if (listeners) {
		listeners.forEach((listener) => {
			try {
				listener(message);
			} catch (err) {
				console.error("Error broadcasting to listener:", err);
			}
		});
	}
}

export function subscribe(eventId: string, listener: EventListener): () => void {
	if (!eventListeners.has(eventId)) {
		eventListeners.set(eventId, new Set());
	}
	eventListeners.get(eventId)!.add(listener);

	// Return unsubscribe function
	return () => {
		const listeners = eventListeners.get(eventId);
		if (listeners) {
			listeners.delete(listener);
			if (listeners.size === 0) {
				eventListeners.delete(eventId);
			}
		}
	};
}

export function getRecentEvents(eventId: string, since?: number): EventMessage[] {
	const events = recentEvents.get(eventId) || [];
	if (since) {
		return events.filter((e) => e.ts > since);
	}
	return events;
}

// Cleanup old events periodically (keep last hour)
setInterval(() => {
	const oneHourAgo = Date.now() - 60 * 60 * 1000;
	for (const [eventId, events] of recentEvents.entries()) {
		const filtered = events.filter((e) => e.ts > oneHourAgo);
		if (filtered.length === 0) {
			recentEvents.delete(eventId);
		} else {
			recentEvents.set(eventId, filtered);
		}
	}
}, 5 * 60 * 1000); // Run every 5 minutes


