import { describe, expect, test } from "vitest";
import { generatePlayerToken, validatePlayerToken } from "../src/lib/playerToken";

describe("playerToken", () => {
	test("generate + validate round trip", () => {
		const eventId = "event-123";
		const playerId = "player-456";
		const token = generatePlayerToken(eventId, playerId);

		expect(token).toHaveLength(24);
		expect(validatePlayerToken({ eventId, playerId, token })).toBe(true);
	});

	test("rejects invalid token length without throwing", () => {
		const eventId = "event-123";
		const playerId = "player-456";

		expect(validatePlayerToken({ eventId, playerId, token: "short" })).toBe(false);
	});

	test("rejects mismatched event or player", () => {
		const token = generatePlayerToken("event-123", "player-456");

		expect(validatePlayerToken({ eventId: "wrong-event", playerId: "player-456", token })).toBe(false);
		expect(validatePlayerToken({ eventId: "event-123", playerId: "wrong-player", token })).toBe(false);
	});
});
