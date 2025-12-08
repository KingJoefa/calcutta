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
			include: { event: true, team: true },
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

		// Toggle pause/resume
		const result = await prisma.$transaction(async (tx) => {
			if (isCurrentlyPaused) {
				// Resume: calculate how long we were paused and adjust closesAt
				if (!lot.pausedAt) {
					throw new Error("Invalid state: pausedAt is null but isCurrentlyPaused is true");
				}

				const pausedDurationMs = now.getTime() - lot.pausedAt.getTime();
				const pausedDurationSeconds = Math.floor(pausedDurationMs / 1000);
				const totalPauseDuration = lot.pauseDurationSeconds + pausedDurationSeconds;

				// Extend closesAt by the paused duration
				const newClosesAt = new Date(lot.closesAt.getTime() + pausedDurationMs);

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
				const updatedLot = await tx.lot.update({
					where: { id: lotId },
					data: {
						pausedAt: now,
					},
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

