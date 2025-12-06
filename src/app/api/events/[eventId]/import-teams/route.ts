import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { shuffleDeterministic } from "@/lib/rng";

export const dynamic = "force-dynamic";

export async function POST(
	_req: NextRequest,
	{ params }: { params: Promise<{ eventId: string }> },
) {
	try {
		const body = await _req.json();
		const { teams }: { teams: Array<{ name: string; seed?: number; region?: string; bracket?: string }> } =
			body;
		if (!Array.isArray(teams) || teams.length === 0) {
			return NextResponse.json({ error: "No teams" }, { status: 400 });
		}
		const { eventId } = await params;
		
		// Get event to access rngSeed
		const event = await prisma.event.findUnique({
			where: { id: eventId },
		});
		if (!event) {
			return NextResponse.json({ error: "Event not found" }, { status: 404 });
		}

		// Create teams
		await prisma.team.createMany({
			data: teams.map((t) => ({
				eventId,
				name: t.name,
				seed: t.seed ?? null,
				region: t.region ?? null,
				bracket: t.bracket ?? null,
			})),
			skipDuplicates: true,
		});

		// Get all teams for this event and randomize into lots
		const allTeams = await prisma.team.findMany({
			where: { eventId },
		});

		if (allTeams.length > 0) {
			// Check if lots already exist
			const existingLots = await prisma.lot.findMany({
				where: { eventId },
			});

			if (existingLots.length === 0) {
				// Randomize teams into lots
				const shuffled = shuffleDeterministic(allTeams, event.rngSeed);
				await prisma.lot.createMany({
					data: shuffled.map((t, idx) => ({
						eventId,
						teamId: t.id,
						orderIndex: idx,
						status: "pending",
					})),
				});
			}
		}

		return NextResponse.json({ ok: true, randomized: existingLots.length === 0 });
	} catch (err) {
		console.error(err);
		return NextResponse.json({ error: "Internal error" }, { status: 500 });
	}
}


