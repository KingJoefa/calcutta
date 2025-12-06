import seedrandom from "seedrandom";

export function shuffleDeterministic<T>(items: T[], seed: string): T[] {
	const rng = seedrandom(seed);
	const arr = items.slice();
	for (let i = arr.length - 1; i > 0; i -= 1) {
		const j = Math.floor(rng() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}


