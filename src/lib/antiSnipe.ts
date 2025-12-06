export function computeAntiSnipeExtension(args: {
	nowMs: number;
	closesAtMs: number;
	antiSnipeWindowSeconds: number;
	extendBySeconds: number;
}): { shouldExtend: boolean; newClosesAtMs: number } {
	const { nowMs, closesAtMs, antiSnipeWindowSeconds, extendBySeconds } = args;
	const windowMs = antiSnipeWindowSeconds * 1000;
	const extendMs = extendBySeconds * 1000;
	if (closesAtMs - nowMs <= windowMs) {
		return { shouldExtend: true, newClosesAtMs: closesAtMs + extendMs };
	}
	return { shouldExtend: false, newClosesAtMs: closesAtMs };
}


