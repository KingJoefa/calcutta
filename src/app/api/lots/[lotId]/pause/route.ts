import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWsServer } from "@/server/wsServer";

export const dynamic = "force-dynamic";

export async function POST(
	_req: NextRequest,
	{ params }: { params: Promise<{ lotId: string }> },
) {
	try {
		const { lotId } = await params;
		const lot = await prisma.lot.findUnique({
			where: { id: lotId },
			include: { event: { include: { ruleSet: true } }, team: true },
		});

		if (!lot) {
			return NextResponse.json({ error: "Lot not found" }, { status: 404 });
		}

		if (lot.status !== "open") {
			return NextResponse.json({ error: "Lot must be open to pause/resume" }, { status: 400 });
		}

		if (!lot.closesAt) {
			return NextResponse.json({ error: "Lot has no closing time" }, { status: 400 });
		}

		const isCurrentlyPaused = lot.pausedAt !== null;
		const now = new Date();
		const nowMs = now.getTime();
		const closesAtMs = lot.closesAt.getTime();
		const isTimerExpired = closesAtMs <= nowMs;

		// Get anti-snipe extension from ruleSet
		// NOTE: event.ruleSet must be included in the query above (maintenance safety)
		const antiSnipeExtensionSeconds = lot.event.ruleSet?.antiSnipeExtensionSeconds ?? 17;
		const antiSnipeExtensionMs = antiSnipeExtensionSeconds * 1000;

		// Toggle pause/resume
		const result = await prisma.$transaction(async (tx) => {
			if (isCurrentlyPaused) {
				// Resume: calculate how long we were paused and adjust closesAt
				// Handle state inconsistency: if pausedAt is null but we think it's paused,
				// treat it as if timer expired and extend by anti-snipe time
				if (!lot.pausedAt) {
					// State inconsistency: treat as expired timer and extend by anti-snipe
					const newClosesAt = new Date(nowMs + antiSnipeExtensionMs);
					const updatedLot = await tx.lot.update({
						where: { id: lotId },
						data: {
							pausedAt: null,
							closesAt: newClosesAt,
						},
					});
					return { lot: updatedLot, action: "resumed", pausedDurationSeconds: 0 };
				}

				const pausedDurationMs = nowMs - lot.pausedAt.getTime();
				const pausedDurationSeconds = Math.floor(pausedDurationMs / 1000);
				const totalPauseDuration = lot.pauseDurationSeconds + pausedDurationSeconds;

				// If timer expired (at 0 or in past), extend by anti-snipe time from now
				// Otherwise, extend closesAt by the paused duration
				let newClosesAt: Date;
				if (isTimerExpired) {
					// Timer is at 0 or expired: extend by anti-snipe time from now
					newClosesAt = new Date(nowMs + antiSnipeExtensionMs);
				} else {
					// Timer still running: extend closesAt by the paused duration
					newClosesAt = new Date(closesAtMs + pausedDurationMs);
				}

				const updatedLot = await tx.lot.update({
					where: { id: lotId },
					data: {
						pausedAt: null, // Clear pause
						pauseDurationSeconds: totalPauseDuration,
						closesAt: newClosesAt,
					},
				});

				return { lot: updatedLot, action: "resumed", pausedDurationSeconds };
			} else {
				// Pause: record when we paused
				// If timer is expired (at 0), extend it by anti-snipe time immediately
				let updateData: { pausedAt: Date; closesAt?: Date } = {
					pausedAt: now,
				};
				
				if (isTimerExpired) {
					// Timer is at 0: extend by anti-snipe time from now
					updateData.closesAt = new Date(nowMs + antiSnipeExtensionMs);
				}

				const updatedLot = await tx.lot.update({
					where: { id: lotId },
					data: updateData,
				});

				return { lot: updatedLot, action: "paused" };
			}
		});

		// Broadcast timer event
		try {
			getWsServer().broadcast(lot.eventId, `timer_${result.action}`, {
				lotId: lot.id,
				pausedAt: result.lot.pausedAt?.toISOString() ?? null,
				closesAt: result.lot.closesAt?.toISOString() ?? null,
				pauseDurationSeconds: result.lot.pauseDurationSeconds,
			});
		} catch (wsErr) {
			console.error("WebSocket broadcast error:", wsErr);
			// Don't fail the request if WebSocket fails
		}

		return NextResponse.json({
			ok: true,
			action: result.action,
			lotId: lot.id,
			pausedAt: result.lot.pausedAt?.toISOString() ?? null,
			closesAt: result.lot.closesAt?.toISOString() ?? null,
			pauseDurationSeconds: result.lot.pauseDurationSeconds,
		});
	} catch (err) {
		console.error("Error pausing/resuming timer:", err);
		const errorMessage = err instanceof Error ? err.message : "Internal error";
		return NextResponse.json(
			{
				error: errorMessage,
				details: process.env.NODE_ENV === "development" ? String(err) : undefined,
			},
			{ status: 500 },
		);
	}
}

