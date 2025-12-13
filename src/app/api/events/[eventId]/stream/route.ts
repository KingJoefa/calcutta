import { NextRequest } from "next/server";
import { subscribe, getRecentEvents } from "@/server/eventBroadcaster";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // Vercel free tier allows up to 60s

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ eventId: string }> },
) {
	const { eventId } = await params;
	const since = req.nextUrl.searchParams.get("since");
	const sinceTs = since ? parseInt(since, 10) : undefined;

	// Create a readable stream for SSE
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			// Send initial connection message
			controller.enqueue(encoder.encode(`: connected\n\n`));

			// Send any recent events the client might have missed
			const recent = getRecentEvents(eventId, sinceTs);
			for (const event of recent) {
				const data = JSON.stringify(event);
				controller.enqueue(encoder.encode(`data: ${data}\n\n`));
			}

			// Subscribe to new events
			const unsubscribe = subscribe(eventId, (message) => {
				try {
					const data = JSON.stringify(message);
					controller.enqueue(encoder.encode(`data: ${data}\n\n`));
				} catch (err) {
					console.error("Error sending SSE message:", err);
				}
			});

			// Send keepalive every 30 seconds
			const keepaliveInterval = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(`: keepalive\n\n`));
				} catch {
					// Stream closed
					clearInterval(keepaliveInterval);
					unsubscribe();
				}
			}, 30000);

			// Cleanup on close
			req.signal.addEventListener("abort", () => {
				clearInterval(keepaliveInterval);
				unsubscribe();
				try {
					controller.close();
				} catch {
					// Already closed
				}
			});
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			"Connection": "keep-alive",
			"X-Accel-Buffering": "no", // Disable buffering for nginx
		},
	});
}


