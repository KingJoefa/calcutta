import crypto from "crypto";

const getSecret = () => {
	const secret = process.env.PLAYER_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
	if (!secret) {
		// Fallback for local dev; in prod this should be set.
		return "dev-player-token-secret";
	}
	return secret;
};

export function generatePlayerToken(eventId: string, playerId: string) {
	const secret = getSecret();
	const hmac = crypto.createHmac("sha256", secret);
	hmac.update(`${eventId}:${playerId}`);
	return hmac.digest("hex").slice(0, 24); // short but still strong enough for links
}

export function validatePlayerToken(args: { eventId: string; playerId: string; token?: string | null }) {
	const { eventId, playerId, token } = args;
	if (!token) return false;
	// If the token length does not match, bail out early to avoid timingSafeEqual throwing
	if (token.length !== 24) return false;
	const expected = generatePlayerToken(eventId, playerId);
	return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}
