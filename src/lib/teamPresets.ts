// Team presets for different sports/leagues

export type TeamPreset = {
	name: string;
	teams: string[];
};

export const TEAM_PRESETS: Record<string, TeamPreset> = {
	college_football: {
		name: "College Football Playoff",
		teams: [
			"Indiana (Seed #1)",
			"Ohio State (Seed #2)",
			"Georgia (Seed #3)",
			"Texas Tech (Seed #4)",
			"Oregon (Seed #5)",
			"Ole Miss (Seed #6)",
			"Texas A&M (Seed #7)",
			"Oklahoma (Seed #8)",
			"Alabama (Seed #9)",
			"Miami (Seed #10)",
			"Tulane (Seed #11)",
			"James Madison (Seed #12)",
		],
	},
	world_cup: {
		name: "World Cup",
		teams: [
			// Group Winners (Seeds 1-12)
			"Mexico (Group A #1)",
			"Canada (Group B #1)",
			"Brazil (Group C #1)",
			"USA (Group D #1)",
			"Germany (Group E #1)",
			"Netherlands (Group F #1)",
			"Belgium (Group G #1)",
			"Spain (Group H #1)",
			"France (Group I #1)",
			"Argentina (Group J #1)",
			"Portugal (Group K #1)",
			"England (Group L #1)",
			// Group Runners-up (Seeds 13-24)
			"South Africa (Group A #2)",
			"Qatar (Group B #3)",
			"Morocco (Group C #2)",
			"Paraguay (Group D #2)",
			"Curaçao (Group E #2)",
			"Japan (Group F #2)",
			"Egypt (Group G #2)",
			"Cabo Verde (Group H #2)",
			"Senegal (Group I #2)",
			"Algeria (Group J #2)",
			"Uzbekistan (Group K #3)",
			"Croatia (Group L #2)",
			// Third Place (Seeds 25-36)
			"Korea Republic (Group A #3)",
			"Switzerland (Group B #4)",
			"Haiti (Group C #3)",
			"Australia (Group D #3)",
			"Côte d'Ivoire (Group E #3)",
			"Tunisia (Group F #4)",
			"IR Iran (Group G #3)",
			"Saudi Arabia (Group H #3)",
			"Norway (Group I #4)",
			"Austria (Group J #3)",
			"Colombia (Group K #4)",
			"Ghana (Group L #3)",
			// Fourth Place
			"Scotland (Group C #4)",
			"Ecuador (Group E #4)",
			"New Zealand (Group G #4)",
			"Uruguay (Group H #4)",
			"Jordan (Group J #4)",
			"Panama (Group L #4)",
		],
	},
	football_playoffs: {
		name: "Football Playoffs (14 teams)",
		teams: [
			"Kansas City Chiefs (AFC #1)",
			"Buffalo Bills (AFC #2)",
			"Baltimore Ravens (AFC #3)",
			"Houston Texans (AFC #4)",
			"Cleveland Browns (AFC #5)",
			"Miami Dolphins (AFC #6)",
			"Pittsburgh Steelers (AFC #7)",
			"San Francisco 49ers (NFC #1)",
			"Dallas Cowboys (NFC #2)",
			"Detroit Lions (NFC #3)",
			"Tampa Bay Buccaneers (NFC #4)",
			"Philadelphia Eagles (NFC #5)",
			"Los Angeles Rams (NFC #6)",
			"Green Bay Packers (NFC #7)",
		],
	},
};

export function getPresetTeams(presetKey: string): string[] {
	return TEAM_PRESETS[presetKey]?.teams || [];
}

export function getPresetName(presetKey: string): string {
	return TEAM_PRESETS[presetKey]?.name || "";
}

