import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { shuffleDeterministic } from "@/lib/rng";

export const dynamic = "force-dynamic";

export async function POST(
	_req: NextRequest,
	{ params }: { params: Promise<{ eventId: string }> },
) {
	try {
		const { eventId } = await params;
		const event = await prisma.event.findUnique({
			where: { id: eventId },
			include: { teams: true },
		});
		if (!event) {
			return NextResponse.json({ error: "Event not found" }, { status: 404 });
		}
		const teams = event.teams;
		if (!teams.length) {
			return NextResponse.json({ error: "No teams to randomize" }, { status: 400 });
		}

		// Check if lots already exist
		const existingLots = await prisma.lot.findMany({
			where: { eventId },
		});

		if (existingLots.length > 0) {
			// Delete existing lots and recreate
			await prisma.lot.deleteMany({
				where: { eventId },
			});
		}

		const shuffled = shuffleDeterministic(teams, event.rngSeed);
		await prisma.$transaction([
			...shuffled.map((t, idx) =>
				prisma.lot.create({
					data: {
						eventId,
						teamId: t.id,
						orderIndex: idx,
						status: "pending",
					},
				}),
			),
		]);
		return NextResponse.json({ ok: true, count: shuffled.length });
	} catch (err) {
		console.error(err);
		return NextResponse.json({ error: "Internal error" }, { status: 500 });
	}
}


