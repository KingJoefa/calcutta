import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { shuffleDeterministic } from "../src/lib/rng";

async function main() {
	if (process.env.SEED_DEMO_EVENT !== "true") {
		console.log("SEED_DEMO_EVENT not true, skipping seed.");
		return;
	}
	const rngSeed = process.env.DEMO_RNG_SEED || "calcutta-demo-seed";
	const name = "Football Calcutta Style Demo Event";
	const roundAllocations = {
		wildcard: 0.1,
		divisional: 0.2,
		conference: 0.3,
		superbowl: 0.4,
	};
	const players = [
		{ name: "Alice", handle: "@alice" },
		{ name: "Bob", handle: "@bob" },
		{ name: "Carol", handle: "@carol" },
		{ name: "Dave", handle: "@dave" },
	];
	// 2024 Football Playoff Teams with actual seeds and bracket positions
	const teams = [
		// AFC
		{ name: "Baltimore Ravens", seed: 1, region: "AFC", bracket: "AFC_North" },
		{ name: "Buffalo Bills", seed: 2, region: "AFC", bracket: "AFC_East" },
		{ name: "Kansas City Chiefs", seed: 3, region: "AFC", bracket: "AFC_West" },
		{ name: "Houston Texans", seed: 4, region: "AFC", bracket: "AFC_South" },
		{ name: "Cleveland Browns", seed: 5, region: "AFC", bracket: "AFC_North" },
		{ name: "Miami Dolphins", seed: 6, region: "AFC", bracket: "AFC_East" },
		{ name: "Pittsburgh Steelers", seed: 7, region: "AFC", bracket: "AFC_North" },
		// NFC
		{ name: "San Francisco 49ers", seed: 1, region: "NFC", bracket: "NFC_West" },
		{ name: "Dallas Cowboys", seed: 2, region: "NFC", bracket: "NFC_East" },
		{ name: "Detroit Lions", seed: 3, region: "NFC", bracket: "NFC_North" },
		{ name: "Tampa Bay Buccaneers", seed: 4, region: "NFC", bracket: "NFC_South" },
		{ name: "Philadelphia Eagles", seed: 5, region: "NFC", bracket: "NFC_East" },
		{ name: "Los Angeles Rams", seed: 6, region: "NFC", bracket: "NFC_West" },
		{ name: "Green Bay Packers", seed: 7, region: "NFC", bracket: "NFC_North" },
	];

	const existing = await prisma.event.findFirst({ where: { name } });
	if (existing) {
		console.log("Demo event already exists:", existing.id);
		return;
	}
	const event = await prisma.event.create({
		data: {
			name,
			rngSeed,
			status: "draft",
			ruleSet: {
				create: {
					anteCents: 1000,
					minIncrementCents: 100,
					auctionTimerSeconds: 30,
					antiSnipeExtensionSeconds: 10,
					roundAllocations,
					additiveCombos: true,
				},
			},
			players: {
				create: players,
			},
			teams: {
				create: teams.map((t) => ({
					name: t.name,
					seed: t.seed,
					region: t.region,
					bracket: t.bracket,
				})),
			},
		},
		include: { players: true, ruleSet: true, teams: true },
	});

	// Create lots in randomized auction order (teams still retain their playoff seed data)
	// The auction order is randomized, but teams keep their actual Football playoff seeds
	const shuffledTeams = shuffleDeterministic([...event.teams], rngSeed);
	await prisma.lot.createMany({
		data: shuffledTeams.map((team, idx) => ({
			eventId: event.id,
			teamId: team.id,
			orderIndex: idx,
			status: "pending",
		})),
	});

		// Charge antes
		await prisma.ledgerEntry.createMany({
			data: event.players.map((player: any) => ({
				eventId: event.id,
				playerId: player.id,
				type: "ante",
				amountCents: event.ruleSet!.anteCents,
				note: "Ante",
			})),
		});

		console.log("Seeded Demo Event:", event.id);
		console.log(`  - ${event.teams.length} Football teams (2024 Football Playoff bracket) randomized into auction lots`);
		console.log(`  - Teams retain their actual playoff seeds (1-7 per conference)`);
		console.log(`  - ${event.players.length} players with antes charged`);
}

main()
	.then(async () => {
		await prisma.$disconnect();
	})
	.catch(async (e) => {
		console.error(e);
		await prisma.$disconnect();
		process.exit(1);
	});


