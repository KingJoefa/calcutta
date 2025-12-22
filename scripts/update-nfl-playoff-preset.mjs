#!/usr/bin/env node
import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";

const DEFAULT_SEASON = 2025;
const DEFAULT_MAX_SEED = 9;
const FINAL_MAX_SEED = 7;
const STANDINGS_BASE_URL = "https://site.api.espn.com/apis/v2/sports/football/nfl/standings";
const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

const args = process.argv.slice(2);
const argValue = (flag) => {
	const index = args.indexOf(flag);
	return index >= 0 ? args[index + 1] : null;
};

const season = Number(argValue("--season") ?? DEFAULT_SEASON);
const maxSeedOverride = Number(argValue("--max-seed"));
const forceFinal = args.includes("--final");

const fetchJson = (url) =>
	new Promise((resolve, reject) => {
		https
			.get(url, (res) => {
				let data = "";
				res.on("data", (chunk) => {
					data += chunk;
				});
				res.on("end", () => {
					if (res.statusCode && res.statusCode >= 400) {
						reject(new Error(`Request failed (${res.statusCode}) for ${url}`));
						return;
					}
					try {
						resolve(JSON.parse(data));
					} catch (err) {
						reject(err);
					}
				});
			})
			.on("error", reject);
	});

const buildStandingsUrl = (seasonValue) => {
	const url = new URL(STANDINGS_BASE_URL);
	url.searchParams.set("season", String(seasonValue));
	return url.toString();
};

const getWeekNumber = async () => {
	const scoreboard = await fetchJson(SCOREBOARD_URL);
	const weekNumber = scoreboard?.week?.number;
	return Number.isFinite(weekNumber) ? weekNumber : null;
};

const loadSeeds = (standings, maxSeed) => {
	const conferences = standings?.children ?? [];
	const result = {};
	for (const conf of conferences) {
		const confKey = conf?.abbreviation;
		if (!confKey) continue;
		const entries = conf?.standings?.entries ?? [];
		const teams = entries
			.map((entry) => {
				const seedStat = entry?.stats?.find(
					(stat) => stat?.name === "playoffSeed" || stat?.type === "playoffseed",
				);
				const seedValue = Number(seedStat?.displayValue ?? seedStat?.value);
				if (!Number.isFinite(seedValue)) return null;
				return { team: entry?.team?.displayName ?? entry?.team?.name, seed: seedValue };
			})
			.filter(Boolean)
			.filter((team) => team.seed >= 1 && team.seed <= maxSeed)
			.sort((a, b) => a.seed - b.seed);
		result[confKey] = teams;
	}
	return result;
};

const formatTeams = (conference, teams) =>
	teams.map((team) => `${team.team} (${conference} #${team.seed})`);

const updatePresetFile = async ({ teams, maxSeed, weekNumber }) => {
	const filePath = path.join(process.cwd(), "src/lib/teamPresets.ts");
	let content = await fs.readFile(filePath, "utf8");

	const listBody = teams.map((item) => `\t\t\t"${item}",`).join("\n");
	const blockRegex = /(football_playoffs:\s*{\s*name:\s*"[^"]*"\s*,\s*teams:\s*\[)([\s\S]*?)(\n\t\t\],\n\t\},)/;
	if (!blockRegex.test(content)) {
		throw new Error("Unable to locate football_playoffs preset in teamPresets.ts");
	}
	content = content.replace(blockRegex, (match, start, middle, end) => `${start}\n${listBody}${end}`);

	const updatedAt = new Date().toISOString().slice(0, 10);
	const weekLabel = weekNumber ?? "unknown";
	const commentLine = `\t// Updated via scripts/update-nfl-playoff-preset.mjs on ${updatedAt} (Week ${weekLabel}, seeds 1-${maxSeed})`;
	const commentRegex = /\t\/\/ Updated via scripts\/update-nfl-playoff-preset\.mjs.*\n\tfootball_playoffs:/;
	if (commentRegex.test(content)) {
		content = content.replace(commentRegex, `${commentLine}\n\tfootball_playoffs:`);
	} else {
		content = content.replace(/\tfootball_playoffs:/, `${commentLine}\n\tfootball_playoffs:`);
	}

	await fs.writeFile(filePath, content, "utf8");
};

const main = async () => {
	const standingsUrl = buildStandingsUrl(season);
	const [standings, weekNumber] = await Promise.all([fetchJson(standingsUrl), getWeekNumber()]);
	let maxSeed = DEFAULT_MAX_SEED;
	if (Number.isFinite(maxSeedOverride) && maxSeedOverride >= 1) {
		maxSeed = maxSeedOverride;
	} else if (forceFinal || (weekNumber !== null && weekNumber >= 18)) {
		maxSeed = FINAL_MAX_SEED;
	}

	const seedsByConf = loadSeeds(standings, maxSeed);
	const afcTeams = seedsByConf.AFC ?? [];
	const nfcTeams = seedsByConf.NFC ?? [];
	if (!afcTeams.length || !nfcTeams.length) {
		throw new Error("Missing AFC or NFC seeds from ESPN standings.");
	}

	const combinedTeams = [
		...formatTeams("AFC", afcTeams),
		...formatTeams("NFC", nfcTeams),
	];

	await updatePresetFile({ teams: combinedTeams, maxSeed, weekNumber });

	console.log(
		`Updated football_playoffs preset for ${season} (Week ${weekNumber ?? "unknown"}, seeds 1-${maxSeed}).`,
	);
};

main().catch((err) => {
	console.error("Failed to update NFL playoff preset:", err.message);
	process.exit(1);
});
