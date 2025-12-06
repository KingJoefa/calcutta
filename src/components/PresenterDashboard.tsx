"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { connectWs, type Message } from "../client/wsClient";

type Player = { id: string; name: string; handle?: string | null };
type Team = { id: string; name: string; seed?: number | null; region?: string | null; bracket?: string | null };
type Lot = {
	id: string;
	orderIndex: number;
	status: "pending" | "open" | "sold";
	currentBidCents: number;
	highBidderId: string | null;
	openedAt: string | null;
	closesAt: string | null;
	team: Team;
};
type Bid = {
	id: string;
	lotId: string;
	playerId: string;
	playerName: string;
	amountCents: number;
	createdAt: string;
	teamName: string;
};

type AuctionState = {
	event: { id: string; name: string; status: string };
	ruleSet: { auctionTimerSeconds: number; antiSnipeExtensionSeconds: number } | null;
	players: Player[];
	lots: Lot[];
	currentLot: Lot | null;
	recentBids: Bid[];
};

export function PresenterDashboard({ eventId, initialState }: { eventId: string; initialState: AuctionState }) {
	const [state, setState] = useState<AuctionState>(initialState);
	const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
	const [isPaused, setIsPaused] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);
	const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const pausedTimeRef = useRef<number | null>(null);

	const currentLot = state.currentLot;
	const highBidder = currentLot?.highBidderId
		? state.players.find((p) => p.id === currentLot.highBidderId)?.name ?? "Unknown"
		: null;

	// Timer calculation
	useEffect(() => {
		if (!currentLot?.closesAt || currentLot.status !== "open") {
			setTimeRemaining(null);
			return;
		}

		const updateTimer = () => {
			if (isPaused && pausedTimeRef.current) {
				setTimeRemaining(pausedTimeRef.current);
				return;
			}

			const closesAt = new Date(currentLot.closesAt!).getTime();
			const now = Date.now();
			const remaining = Math.max(0, Math.floor((closesAt - now) / 1000));
			setTimeRemaining(remaining);
			
			if (!isPaused) {
				pausedTimeRef.current = remaining;
			}
		};

		updateTimer();
		timerIntervalRef.current = setInterval(updateTimer, 100);

		return () => {
			if (timerIntervalRef.current) {
				clearInterval(timerIntervalRef.current);
			}
		};
	}, [currentLot?.closesAt, currentLot?.status, isPaused]);

	// WebSocket connection
	useEffect(() => {
		fetch("/api/ws").finally(() => {
			wsRef.current = connectWs(eventId, (msg: Message) => {
				if (msg.type === "bid_placed") {
					const payload = msg.payload as any;
					setState((prev) => ({
						...prev,
						lots: prev.lots.map((l) =>
							l.id === payload.lotId
								? {
										...l,
										currentBidCents: payload.amountCents,
										highBidderId: payload.playerId,
										closesAt: payload.closesAt ?? l.closesAt,
									}
								: l,
						),
						currentLot:
							prev.currentLot?.id === payload.lotId
								? {
										...prev.currentLot,
										currentBidCents: payload.amountCents,
										highBidderId: payload.playerId,
										closesAt: payload.closesAt ?? prev.currentLot.closesAt,
									}
								: prev.currentLot,
						recentBids: [
							{
								id: `temp-${Date.now()}`,
								lotId: payload.lotId,
								playerId: payload.playerId,
								playerName: prev.players.find((p) => p.id === payload.playerId)?.name ?? "Unknown",
								amountCents: payload.amountCents,
								createdAt: new Date().toISOString(),
								teamName: prev.currentLot?.team.name ?? "",
							},
							...prev.recentBids.slice(0, 49),
						],
					}));
				}
				if (msg.type === "lot_sold") {
					const payload = msg.payload as any;
					setState((prev) => ({
						...prev,
						lots: prev.lots.map((l) =>
							l.id === payload.lotId ? { ...l, status: "sold" } : l,
						),
						currentLot:
							prev.currentLot?.id === payload.lotId
								? { ...prev.currentLot, status: "sold" }
								: prev.currentLot,
					}));
				}
				if (msg.type === "lot_opened") {
					const payload = msg.payload as any;
					setState((prev) => {
						const updatedLots = prev.lots.map((l) =>
							l.id === payload.lotId
								? {
										...l,
										status: "open",
										closesAt: payload.closesAt ?? l.closesAt,
										openedAt: new Date().toISOString(),
									}
								: l,
						);
						const newCurrentLot = updatedLots.find((l) => l.id === payload.lotId) ?? null;
						return {
							...prev,
							lots: updatedLots,
							currentLot: newCurrentLot,
						};
					});
				}
			});
		});

		return () => {
			wsRef.current?.close();
		};
	}, [eventId]);

	const post = async (url: string, body?: any) => {
		const res = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: body ? JSON.stringify(body) : undefined,
		});
		if (!res.ok) {
			const e = await res.json().catch(() => ({}));
			alert(e.error || "Request failed");
		}
	};

	const handlePauseToggle = () => {
		if (isPaused) {
			// Resume: adjust closesAt by adding the paused duration
			if (currentLot?.closesAt && pausedTimeRef.current) {
				const pausedDuration = pausedTimeRef.current - timeRemaining!;
				const newClosesAt = new Date(Date.now() + pausedDuration * 1000);
				// Note: This would require an API endpoint to update closesAt
				// For now, we'll just toggle the UI state
			}
		}
		setIsPaused(!isPaused);
	};

	const formatTime = (seconds: number | null) => {
		if (seconds === null) return "--:--";
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	const teamDisplay = currentLot?.team.seed
		? `${currentLot.team.name} (${currentLot.team.region} #${currentLot.team.seed})`
		: currentLot?.team.name ?? "No team";

	const nextLot = currentLot
		? state.lots
				.filter((l) => l.orderIndex > currentLot.orderIndex)
				.find((l) => l.status !== "sold")
		: state.lots.find((l) => l.status === "pending");

	return (
		<div
			style={{
				display: "flex",
				height: "100vh",
				backgroundColor: "#0a0a0a",
				color: "#e5e5e5",
				fontFamily: "system-ui, -apple-system, sans-serif",
			}}
		>
			{/* Left Control Panel */}
			<div
				style={{
					width: "400px",
					borderRight: "1px solid #1f1f1f",
					display: "flex",
					flexDirection: "column",
					backgroundColor: "#111111",
				}}
			>
				<div style={{ padding: "24px", borderBottom: "1px solid #1f1f1f" }}>
					<h1 style={{ margin: 0, fontSize: "20px", fontWeight: 600, color: "#f5f5f5" }}>
						{state.event.name}
					</h1>
					<div style={{ marginTop: "8px", fontSize: "14px", color: "#888" }}>
						Presenter Dashboard
					</div>
				</div>

				<div style={{ padding: "24px", flex: 1, display: "flex", flexDirection: "column", gap: "24px" }}>
					{/* Current Team */}
					<div>
						<div style={{ fontSize: "12px", color: "#888", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
							Current Team
						</div>
						<div style={{ fontSize: "28px", fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
							{teamDisplay}
						</div>
						{currentLot?.team.bracket && (
							<div style={{ marginTop: "4px", fontSize: "14px", color: "#aaa" }}>
								{currentLot.team.bracket}
							</div>
						)}
					</div>

					{/* Current Bid */}
					<div>
						<div style={{ fontSize: "12px", color: "#888", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
							Current Bid
						</div>
						<div style={{ fontSize: "48px", fontWeight: 700, color: "#4ade80", lineHeight: 1 }}>
							${((currentLot?.currentBidCents ?? 0) / 100).toFixed(2)}
						</div>
						{highBidder && (
							<div style={{ marginTop: "8px", fontSize: "16px", color: "#ccc" }}>
								High Bidder: <span style={{ fontWeight: 600 }}>{highBidder}</span>
							</div>
						)}
					</div>

					{/* Timer */}
					<div>
						<div style={{ fontSize: "12px", color: "#888", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
							Time Remaining
						</div>
						<div
							style={{
								fontSize: "64px",
								fontWeight: 700,
								color: timeRemaining !== null && timeRemaining < 10 ? "#ef4444" : "#60a5fa",
								lineHeight: 1,
								fontVariantNumeric: "tabular-nums",
							}}
						>
							{formatTime(timeRemaining)}
						</div>
					</div>

					{/* Host Controls */}
					<div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
						{currentLot && (
							<>
								{currentLot.status !== "open" ? (
									<button
										onClick={() => post(`/api/lots/${currentLot.id}/open`)}
										style={{
											padding: "14px 24px",
											backgroundColor: "#4ade80",
											color: "#000",
											border: "none",
											borderRadius: "8px",
											fontSize: "16px",
											fontWeight: 600,
											cursor: "pointer",
											transition: "background-color 0.2s",
										}}
										onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#22c55e")}
										onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#4ade80")}
									>
										Open Lot
									</button>
								) : (
									<>
										<button
											onClick={handlePauseToggle}
											style={{
												padding: "14px 24px",
												backgroundColor: isPaused ? "#4ade80" : "#f59e0b",
												color: "#000",
												border: "none",
												borderRadius: "8px",
												fontSize: "16px",
												fontWeight: 600,
												cursor: "pointer",
												transition: "background-color 0.2s",
											}}
										>
											{isPaused ? "Resume Timer" : "Pause Timer"}
										</button>
										<button
											onClick={() => post(`/api/lots/${currentLot.id}/sell`)}
											style={{
												padding: "14px 24px",
												backgroundColor: "#ef4444",
												color: "#fff",
												border: "none",
												borderRadius: "8px",
												fontSize: "16px",
												fontWeight: 600,
												cursor: "pointer",
												transition: "background-color 0.2s",
											}}
											onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#dc2626")}
											onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#ef4444")}
										>
											Accept Bid & Advance
										</button>
									</>
								)}
								<button
									onClick={() => post(`/api/events/${eventId}/undo`)}
									style={{
										padding: "12px 24px",
										backgroundColor: "#1f1f1f",
										color: "#e5e5e5",
										border: "1px solid #333",
										borderRadius: "8px",
										fontSize: "14px",
										fontWeight: 500,
										cursor: "pointer",
										transition: "background-color 0.2s",
									}}
									onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#2a2a2a")}
									onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#1f1f1f")}
								>
									Undo Last Sale
								</button>
							</>
						)}
						{nextLot && (
							<div style={{ marginTop: "16px", padding: "12px", backgroundColor: "#1a1a1a", borderRadius: "8px" }}>
								<div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>Next Up</div>
								<div style={{ fontSize: "16px", fontWeight: 600 }}>
									{nextLot.team.seed
										? `${nextLot.team.name} (${nextLot.team.region} #${nextLot.team.seed})`
										: nextLot.team.name}
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Right Activity Feed */}
			<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
				<div style={{ padding: "24px", borderBottom: "1px solid #1f1f1f" }}>
					<h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>Activity Feed</h2>
				</div>
				<div
					style={{
						flex: 1,
						overflowY: "auto",
						padding: "24px",
						display: "flex",
						flexDirection: "column",
						gap: "12px",
					}}
				>
					{state.recentBids.length === 0 ? (
						<div style={{ color: "#666", fontSize: "14px", textAlign: "center", marginTop: "48px" }}>
							No bids yet
						</div>
					) : (
						state.recentBids.map((bid) => {
							const isCurrentLot = bid.lotId === currentLot?.id;
							return (
								<div
									key={bid.id}
									style={{
										padding: "16px",
										backgroundColor: isCurrentLot ? "#1a2e1a" : "#1a1a1a",
										borderRadius: "8px",
										border: isCurrentLot ? "1px solid #4ade80" : "1px solid #2a2a2a",
									}}
								>
									<div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
										<div>
											<div style={{ fontSize: "16px", fontWeight: 600, color: "#fff" }}>
												{bid.playerName}
											</div>
											<div style={{ fontSize: "14px", color: "#888", marginTop: "4px" }}>
												{bid.teamName}
											</div>
										</div>
										<div style={{ textAlign: "right" }}>
											<div style={{ fontSize: "20px", fontWeight: 700, color: "#4ade80" }}>
												${(bid.amountCents / 100).toFixed(2)}
											</div>
											<div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
												{new Date(bid.createdAt).toLocaleTimeString()}
											</div>
										</div>
									</div>
								</div>
							);
						})
					)}
				</div>
			</div>
		</div>
	);
}

