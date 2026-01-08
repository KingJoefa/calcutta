/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { AuctionTimeline } from "../components/AuctionTimeline";
import { TEAM_PRESETS, getPresetTeams } from "../lib/teamPresets";
import styles from "./page.module.css";

export default function Home() {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const DEFAULT_TEAM_PRESET = "football_playoffs";
	const [selectedPreset, setSelectedPreset] = useState<string>(DEFAULT_TEAM_PRESET);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [playersInput, setPlayersInput] = useState("");
	const [teamsInput, setTeamsInput] = useState(() => getPresetTeams(DEFAULT_TEAM_PRESET).join("\n"));
	const [playersFocused, setPlayersFocused] = useState(false);
	const [buyIn, setBuyIn] = useState("10");
	const [minIncrementDollars, setMinIncrementDollars] = useState("5");
	const [auctionTimerSeconds, setAuctionTimerSeconds] = useState("45");
	const [antiSnipeExtensionSeconds, setAntiSnipeExtensionSeconds] = useState("17");
	const [intermissionSeconds, setIntermissionSeconds] = useState("30");

	const parseList = (raw: string) => {
		const cleaned = raw.replace(/,/g, "\n");
		const seen = new Set<string>();
		const entries: string[] = [];
		for (const line of cleaned.split(/\n/)) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			const key = trimmed.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			entries.push(trimmed);
		}
		return entries;
	};

	const players = parseList(playersInput);
	const teams = parseList(teamsInput);

	const isValid = players.length >= 2 && teams.length >= 4;
	const disableReason = !isValid
		? `Add at least ${players.length < 2 ? "2 players" : ""}${
				players.length < 2 && teams.length < 4 ? " and " : ""
			}${teams.length < 4 ? "4 teams" : ""}`
		: null;

	const buyInValue = Number(buyIn) || 0;
	const potPreview = players.length > 0 ? buyInValue * players.length : null;

	const formatMoney = (num: number) =>
		`$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

	return (
		<div className={styles.page}>
			<AuctionTimeline currentStep="home" />
			<div className={styles.container}>
				<section className={styles.heroSection}>
					<div className={styles.heroText}>
						<div className={styles.heroBrand}>
							<div className={styles.heroLogo}>
								<img src="/auction-squad-icon.svg" alt="Auction Squad logo" />
							</div>
							<div className={styles.heroKicker}>Auction Squad</div>
						</div>
						<h1 className={styles.heroTitle}>Host a live Calcutta auction with friends</h1>
						<p className={styles.heroSubtitle}>
							Lock in the action for sports’ biggest moments with private invites, live bidding, and timing protection.
						</p>
					</div>
					<div className={styles.heroHighlight}>
						<div className={styles.highlightTitle}>How it works</div>
						<ul className={styles.highlightList}>
							<li>1) Choose teams + players, then create the event.</li>
							<li>2) Share private links with your squad.</li>
							<li>3) Start bidding—host controls the order and timer.</li>
							<li>4) Bids update instantly for everyone.</li>
							<li>5) Export results once the auction locks.</li>
						</ul>
						<div className={styles.highlightBadge}>Grab your squad</div>
					</div>
				</section>

				<form
					className={styles.formGrid}
					onSubmit={async (e) => {
						e.preventDefault();
						if (isSubmitting) return;

						setIsSubmitting(true);
						setError(null);

						try {
							const form = e.target as HTMLFormElement;
							const data = new FormData(form);
							const eventName =
								(data.get("name") as string) || "Football Calcutta Style Demo Event";

							// Parse players from textarea (one per line, optional @handle)
							const playersParsed = players.map((line) => {
								const match = line.match(/^(.+?)(?:\s+@(.+))?$/);
								if (match) {
									return {
										name: match[1].trim(),
										handle: match[2] ? `@${match[2].trim()}` : undefined,
									};
								}
								return { name: line };
							});

							// Default to demo players if none provided
							const finalPlayers =
								playersParsed.length > 0
									? playersParsed
									: [
											{ name: "Alice", handle: "@alice" },
											{ name: "Bob", handle: "@bob" },
											{ name: "Carol", handle: "@carol" },
											{ name: "Dave", handle: "@dave" },
									  ];

							// Parse teams from textarea (one per line, optional seed/region info)
							const teamsParsed = teams.map((line) => {
								// Try to parse seed/region info: "Team Name (AFC #1)", "Team Name (NFC #2)", or "Team Name (Seed #1)"
								const seedMatch = line.match(/^(.+?)\s*\(([A-Za-z\s]+)\s*#(\d+)\)$/);
								if (seedMatch) {
									return {
										name: seedMatch[1].trim(),
										region: seedMatch[2].trim(),
										seed: parseInt(seedMatch[3], 10),
									};
								}
								return { name: line };
							});

							// Convert dollars to cents for API
							const anteDollars = Number(data.get("anteDollars") || buyInValue);
							const minIncDollars = Number(data.get("minIncrementDollars") || minIncrementDollars);
							const rawIntermission = Number(data.get("intermissionSeconds") || intermissionSeconds);
							const intermission = Number.isFinite(rawIntermission)
								? Math.min(180, Math.max(3, Math.trunc(rawIntermission)))
								: 30;

							const payload = {
								name: eventName,
								// rngSeed is now optional - will be auto-generated by the API
								ruleSet: {
									anteCents: Math.round(anteDollars * 100),
									minIncrementCents: Math.round(minIncDollars * 100),
									auctionTimerSeconds: Number(data.get("auctionTimerSeconds") || auctionTimerSeconds),
									antiSnipeExtensionSeconds: Number(
										data.get("antiSnipeExtensionSeconds") || antiSnipeExtensionSeconds,
									),
									intermissionSeconds: intermission,
									roundAllocations: {
										wildcard: 0.04,
										divisional: 0.06,
										conference: 0.12,
										superbowl: 0.28,
									},
									payoutBasis: "total_pot",
									includeAnteInPot: true,
								},
								players: finalPlayers,
								teams: teamsParsed.length > 0 ? teamsParsed : undefined, // Only include if teams provided
							};
							const response = await fetch("/api/events", {
								method: "POST",
								headers: { "content-type": "application/json" },
								body: JSON.stringify(payload),
							});

							const res = await response.json();

							if (!response.ok) {
								const errorMsg = res.error || "Failed to create event";
								const details = res.details ? `\n\nDetails: ${res.details}` : "";
								throw new Error(errorMsg + details);
							}

							if (res.eventId) {
								// Redirect to presenter dashboard which has all host controls
								window.location.href = `/presenter/${res.eventId}`;
							} else {
								throw new Error("No event ID returned");
							}
						} catch (err) {
							console.error("Error creating event:", err);
							setError(err instanceof Error ? err.message : "Failed to create event");
							setIsSubmitting(false);
						}
					}}
				>
					<div className={styles.sideColumn}>
						<div className={styles.section}>
							<div className={styles.sectionHeader}>
								<h3 className={styles.sectionTitle}>1. Teams</h3>
								<p className={styles.sectionSubtitle}>
									Paste teams (one per line). Format: Team (AFC #1).
								</p>
							</div>
							<div className={styles.counterRow}>Teams: {teams.length} (min 4)</div>
							<div className={styles.field}>
								<div className={styles.presetRow}>
									<button
										type="button"
										onClick={() => {
											const teams = getPresetTeams("college_football");
											setTeamsInput(teams.join("\n"));
											setSelectedPreset("college_football");
										}}
										className={`${styles.presetButton} ${selectedPreset === "college_football" ? styles.presetActive : ""}`}
									>
										🏈 College Football
									</button>
									<button
										type="button"
										onClick={() => {
											const teams = getPresetTeams("world_cup");
											setTeamsInput(teams.join("\n"));
											setSelectedPreset("world_cup");
										}}
										className={`${styles.presetButton} ${selectedPreset === "world_cup" ? styles.presetActive : ""}`}
									>
										⚽ World Cup
									</button>
									<button
										type="button"
										onClick={() => {
											const teams = getPresetTeams("football_playoffs");
											setTeamsInput(teams.join("\n"));
											setSelectedPreset("football_playoffs");
										}}
										className={`${styles.presetButton} ${selectedPreset === "football_playoffs" ? styles.presetActive : ""}`}
									>
										🏈 Football Playoffs
									</button>
									<button
										type="button"
										onClick={() => {
											setTeamsInput("");
											setSelectedPreset("");
										}}
										className={styles.presetButton}
									>
										Clear
									</button>
								</div>
								<textarea
									id="teams"
									name="teams"
									className={styles.textarea}
									rows={6}
									placeholder={"Kansas City Chiefs (AFC #1)\nBuffalo Bills (AFC #2)\nBaltimore Ravens (AFC #3)"}
									value={teamsInput}
									onInput={(e) => {
										if (selectedPreset) {
											setSelectedPreset("");
										}
										setTeamsInput(e.currentTarget.value);
									}}
								/>
							</div>
						</div>

						<div className={styles.section}>
							<div className={styles.sectionHeader}>
								<h3 className={styles.sectionTitle}>2. Players</h3>
								<p className={styles.sectionSubtitle}>Paste your squad (one per line).</p>
							</div>
							<div className={styles.counterRow}>Players: {players.length} (min 2)</div>
							<div className={styles.field}>
								<textarea
									id="players"
									name="players"
									className={styles.textarea}
									placeholder={"Alice\nBob @bob\nCarol @carol\nDave"}
									value={playersInput}
									onInput={(e) => setPlayersInput(e.currentTarget.value)}
									onFocus={() => setPlayersFocused(true)}
									onBlur={() => setPlayersFocused(false)}
								/>
								{playersFocused && (
									<div className={styles.helperInline}>Paste from group chat; @handle optional; duplicates removed.</div>
								)}
							</div>
						</div>
					</div>

					<div className={styles.formCard}>
						<div className={styles.cardHeader}>
							<div>
								<h2 className={styles.cardTitle}>3. Rules</h2>
								<p className={styles.cardSubtitle}>Set the rules and start inviting your squad.</p>
							</div>
						</div>

						<div className={styles.section}>
							<div className={styles.fieldsGrid}>
								<div className={styles.field}>
									<label htmlFor="name" className={styles.label}>
										Event Name
									</label>
									<input
										id="name"
										name="name"
										type="text"
										className={styles.input}
										placeholder="Playoffs 2025"
										required
									/>
								</div>

								<div className={styles.field}>
									<label htmlFor="anteDollars" className={styles.label}>
										Buy-in (per person)
									</label>
									<input
										id="anteDollars"
										name="anteDollars"
										type="number"
										step="0.01"
										min="0"
										className={styles.input}
										placeholder="10"
										value={buyIn}
										onInput={(e) => setBuyIn(e.currentTarget.value)}
									/>
									<span className={styles.helperText}>
										{potPreview !== null
											? `Buy-ins = ${formatMoney(potPreview)} if everyone pays (bids add to pot separately)`
											: "Add players to show buy-in total"}
									</span>
								</div>

								<div className={styles.field}>
									<label htmlFor="auctionTimerSeconds" className={styles.label}>
										Auction Timer
									</label>
									<input
										id="auctionTimerSeconds"
										name="auctionTimerSeconds"
										type="number"
										className={styles.input}
										placeholder="45"
										value={auctionTimerSeconds}
										onInput={(e) => setAuctionTimerSeconds(e.currentTarget.value)}
									/>
								</div>

								{showAdvanced && (
									<>
										<div className={styles.field}>
											<label htmlFor="minIncrementDollars" className={styles.label}>
												Minimum Increment
											</label>
											<input
												id="minIncrementDollars"
												name="minIncrementDollars"
											type="number"
											step="0.01"
											min="0"
											className={styles.input}
											placeholder="5.00"
											value={minIncrementDollars}
											onInput={(e) => setMinIncrementDollars(e.currentTarget.value)}
										/>
									</div>

										<div className={styles.field}>
											<label htmlFor="antiSnipeExtensionSeconds" className={styles.label}>
												Anti-Snipe Extension
											</label>
											<input
											id="antiSnipeExtensionSeconds"
											name="antiSnipeExtensionSeconds"
											type="number"
											className={styles.input}
											placeholder="17"
											value={antiSnipeExtensionSeconds}
											onInput={(e) => setAntiSnipeExtensionSeconds(e.currentTarget.value)}
										/>
									</div>
									
										<div className={styles.field}>
											<label htmlFor="intermissionSeconds" className={styles.label}>
												Break Between Teams (seconds)
											</label>
											<input
												id="intermissionSeconds"
												name="intermissionSeconds"
												type="number"
												className={styles.input}
												min="3"
												max="180"
												placeholder="30"
												value={intermissionSeconds}
												onInput={(e) => setIntermissionSeconds(e.currentTarget.value)}
											/>
											<span className={styles.helperText}>How long to pause between sold teams before the next team becomes available (3–180s).</span>
										</div>
									</>
								)}
							</div>
							<button
								type="button"
								className={styles.advancedToggle}
								onClick={() => setShowAdvanced((prev) => !prev)}
							>
								{showAdvanced ? "▲ Hide advanced options" : "▼ Advanced options"}
							</button>
						</div>

						<div className={styles.rulesSummary}>
							Rules summary: Timer {auctionTimerSeconds || "—"}s • Break {intermissionSeconds || "—"}s • Min increment ${minIncrementDollars || "—"} • Anti-snipe {antiSnipeExtensionSeconds || "—"}s
						</div>

						{error && <div className={styles.errorBox}>{error}</div>}
						<div className={styles.actionsBar}>
							<div className={styles.trustLine}>Invite links are private • Host can’t bid as others • All bids timestamped</div>
							<div className={styles.previewLine}>Preview what bidders see after you create the event.</div>
							<button type="submit" className={styles.button} disabled={isSubmitting || !isValid}>
								{isSubmitting ? "Creating..." : "Create Event"}
							</button>
							{disableReason && <div className={styles.disableReason}>{disableReason}</div>}
						</div>
					</div>
				</form>

				<div className={styles.infoGrid}>
				</div>

			</div>
		</div>
	);
}
