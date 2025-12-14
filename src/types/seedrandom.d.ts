declare module "seedrandom" {
	type PRNG = () => number;
	export default function seedrandom(seed?: string): PRNG;
}


