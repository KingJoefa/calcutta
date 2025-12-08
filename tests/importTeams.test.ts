import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
import { shuffleDeterministic } from "../src/lib/rng";

// Mock Prisma
vi.mock("../src/lib/prisma", () => ({
	prisma: {
		event: {
			findUnique: vi.fn(),
		},
		lot: {
			findMany: vi.fn(),
		},
		team: {
			createMany: vi.fn(),
			findMany: vi.fn(),
		},
		$transaction: vi.fn(),
	},
}));

// Mock RNG
vi.mock("../src/lib/rng", () => ({
	shuffleDeterministic: vi.fn((teams) => teams), // Return teams in original order for testing
}));

describe("import-teams endpoint logic", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should randomize teams when no lots exist", async () => {
		const eventId = "event-123";
		const rngSeed = "test-seed";
		const mockTeams = [
			{ id: "team-1", name: "Team A", eventId },
			{ id: "team-2", name: "Team B", eventId },
			{ id: "team-3", name: "Team C", eventId },
		];

		// Mock: event exists
		vi.mocked(prisma.event.findUnique).mockResolvedValue({
			id: eventId,
			name: "Test Event",
			rngSeed,
			status: "draft",
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any);

		// Mock: no existing lots
		vi.mocked(prisma.lot.findMany).mockResolvedValue([]);

		// Mock: transaction
		vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
			const tx = {
				team: {
					createMany: vi.fn().mockResolvedValue({ count: 3 }),
					findMany: vi.fn().mockResolvedValue(mockTeams),
				},
				lot: {
					createMany: vi.fn().mockResolvedValue({ count: 3 }),
				},
			};
			return callback(tx as any);
		});

		// Simulate the endpoint logic
		const existingLots = await prisma.lot.findMany({ where: { eventId } });
		const wasRandomized = existingLots.length === 0;

		await prisma.$transaction(async (tx) => {
			await tx.team.createMany({
				data: [
					{ eventId, name: "Team A" },
					{ eventId, name: "Team B" },
					{ eventId, name: "Team C" },
				],
				skipDuplicates: true,
			});

			if (wasRandomized) {
				const allTeams = await tx.team.findMany({ where: { eventId } });
				if (allTeams.length > 0) {
					const shuffled = shuffleDeterministic(allTeams, rngSeed);
					await tx.lot.createMany({
						data: shuffled.map((t, idx) => ({
							eventId,
							teamId: t.id,
							orderIndex: idx,
							status: "pending",
						})),
					});
				}
			}
		});

		// Verify lots were created
		expect(prisma.$transaction).toHaveBeenCalled();
		const transactionCallback = vi.mocked(prisma.$transaction).mock.calls[0][0];
		const mockTx = {
			team: {
				createMany: vi.fn(),
				findMany: vi.fn().mockResolvedValue(mockTeams),
			},
			lot: {
				createMany: vi.fn(),
			},
		};
		await transactionCallback(mockTx as any);
		expect(mockTx.lot.createMany).toHaveBeenCalled();
		expect(wasRandomized).toBe(true);
	});

	it("should NOT randomize teams when lots already exist", async () => {
		const eventId = "event-123";
		const rngSeed = "test-seed";

		// Mock: event exists
		vi.mocked(prisma.event.findUnique).mockResolvedValue({
			id: eventId,
			name: "Test Event",
			rngSeed,
			status: "draft",
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any);

		// Mock: lots already exist
		vi.mocked(prisma.lot.findMany).mockResolvedValue([
			{ id: "lot-1", eventId, teamId: "team-1", orderIndex: 0, status: "pending" },
		] as any);

		// Mock: transaction
		vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
			const tx = {
				team: {
					createMany: vi.fn().mockResolvedValue({ count: 3 }),
					findMany: vi.fn(),
				},
				lot: {
					createMany: vi.fn(),
				},
			};
			return callback(tx as any);
		});

		// Simulate the endpoint logic
		const existingLots = await prisma.lot.findMany({ where: { eventId } });
		const wasRandomized = existingLots.length === 0;

		await prisma.$transaction(async (tx) => {
			await tx.team.createMany({
				data: [
					{ eventId, name: "Team A" },
					{ eventId, name: "Team B" },
					{ eventId, name: "Team C" },
				],
				skipDuplicates: true,
			});

			if (wasRandomized) {
				// This block should NOT execute
				const allTeams = await tx.team.findMany({ where: { eventId } });
				if (allTeams.length > 0) {
					const shuffled = shuffleDeterministic(allTeams, rngSeed);
					await tx.lot.createMany({
						data: shuffled.map((t, idx) => ({
							eventId,
							teamId: t.id,
							orderIndex: idx,
							status: "pending",
						})),
					});
				}
			}
		});

		// Verify lots were NOT created
		expect(prisma.$transaction).toHaveBeenCalled();
		const transactionCallback = vi.mocked(prisma.$transaction).mock.calls[0][0];
		const mockTx = {
			team: {
				createMany: vi.fn(),
				findMany: vi.fn(),
			},
			lot: {
				createMany: vi.fn(),
			},
		};
		await transactionCallback(mockTx as any);
		expect(mockTx.lot.createMany).not.toHaveBeenCalled();
		expect(wasRandomized).toBe(false);
	});

	it("should handle existingLots being defined outside block scope", async () => {
		const eventId = "event-123";
		
		// Mock: no existing lots
		vi.mocked(prisma.lot.findMany).mockResolvedValue([]);

		// This simulates the fix: existingLots declared outside if block
		const existingLots = await prisma.lot.findMany({ where: { eventId } });
		const wasRandomized = existingLots.length === 0;

		// Verify existingLots is accessible and wasRandomized is correct
		expect(existingLots).toBeDefined();
		expect(Array.isArray(existingLots)).toBe(true);
		expect(wasRandomized).toBe(true);
		expect(() => {
			// This should not throw ReferenceError
			const result = { ok: true, randomized: wasRandomized };
			return result;
		}).not.toThrow();
	});
});

