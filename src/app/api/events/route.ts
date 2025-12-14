import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWsServer } from "@/server/wsServer";
import { shuffleDeterministic } from "@/lib/rng";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const {
			name,
			rngSeed,
			ruleSet,
			players,
			teams,
		}: {
			name: string;
			rngSeed?: string;
			ruleSet: {
				anteCents: number;
				minIncrementCents: number;
				auctionTimerSeconds: number;
				antiSnipeExtensionSeconds: number;
				intermissionSeconds?: number;
				roundAllocations: Record<string, number>;
				additiveCombos?: boolean;
				payoutBasis?: string;
				includeAnteInPot?: boolean;
			};
			players: Array<{ name: string; handle?: string }>;
			teams?: Array<{ name: string; seed?: number; region?: string; bracket?: string }>;
		} = body;

		if (!name || !ruleSet || !players?.length) {
			return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
		}
		
		const clampInt = (val: unknown, min: number, max: number, fallback: number) => {
			const n = typeof val === "number" ? val : Number(val);
			if (!Number.isFinite(n)) return fallback;
			return Math.min(max, Math.max(min, Math.trunc(n)));
		};

		// Generate random seed if not provided
		const seed = rngSeed || `${name}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

		const event = await prisma.event.create({
			data: {
				name,
				rngSeed: seed,
				status: "draft",
				ruleSet: {
					create: {
						anteCents: ruleSet.anteCents,
						minIncrementCents: ruleSet.minIncrementCents,
						auctionTimerSeconds: ruleSet.auctionTimerSeconds,
						antiSnipeExtensionSeconds: ruleSet.antiSnipeExtensionSeconds,
						intermissionSeconds: clampInt(ruleSet.intermissionSeconds, 3, 180, 30),
						roundAllocations: ruleSet.roundAllocations,
						additiveCombos: ruleSet.additiveCombos ?? true,
						payoutBasis: (ruleSet.payoutBasis as any) ?? "total_pot",
						includeAnteInPot: ruleSet.includeAnteInPot ?? true,
					},
				},
				players: {
					create: players.map((e) => ({ name: e.name, handle: e.handle })),
				},
				...(teams && teams.length > 0 ? {
					teams: {
						create: teams.map((t) => ({
							name: t.name,
							seed: t.seed ?? null,
							region: t.region ?? null,
							bracket: t.bracket ?? null,
						})),
					},
				} : {}),
			},
			include: { players: true, ruleSet: true, teams: true },
		});

		// Ledger: charge ante per player
		if (event.ruleSet) {
			await prisma.ledgerEntry.createMany({
				data: event.players.map((player) => ({
					eventId: event.id,
					playerId: player.id,
					type: "ante",
					amountCents: event.ruleSet!.anteCents,
					note: "Ante",
				})),
			});
		}

		// If teams were provided, randomize them into lots
		if (teams && teams.length > 0 && event.teams.length > 0) {
			const shuffledTeams = shuffleDeterministic(event.teams, seed);
			await prisma.lot.createMany({
				data: shuffledTeams.map((team, idx) => ({
					eventId: event.id,
					teamId: team.id,
					orderIndex: idx,
					status: "pending",
				})),
			});
		}

		// Ensure WS server is up
		getWsServer();

		const url = new URL(req.url);
		const base = `${url.protocol}//${url.host}`;
		const links = {
			host: `${base}/host/${event.id}`,
			presenter: `${base}/presenter/${event.id}`,
			audience: `${base}/audience/${event.id}`,
			eventId: event.id,
		};
		return NextResponse.json(links);
	} catch (err) {
		console.error("Error creating event:", err);
		const errorMessage = err instanceof Error ? err.message : "Internal error";
		return NextResponse.json({ 
			error: errorMessage,
			details: process.env.NODE_ENV === "development" ? String(err) : undefined
		}, { status: 500 });
	}
}

