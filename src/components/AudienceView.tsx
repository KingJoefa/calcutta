"use client";

import { useEffect, useState, useRef } from "react";
import { connectWs, type Message } from "../client/wsClient";

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

type AuctionState = {
	event: { id: string; name: string; status: string };
	ruleSet: { minIncrementCents: number } | null;
	currentLot: Lot | null;
	players: Array<{ id: string; name: string }>;
};

export function AudienceView({ eventId, initialState }: { eventId: string; initialState: AuctionState }) {
	const [state, setState] = useState<AuctionState>(initialState);
	const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
	const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
	const [bidAmount, setBidAmount] = useState<string>("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);
	const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

	const currentLot = state.currentLot;
	const minBid = currentLot
		? (currentLot.currentBidCents + (state.ruleSet?.minIncrementCents ?? 100)) / 100
		: 0;

	// Timer calculation
	useEffect(() => {
		if (!currentLot?.closesAt || currentLot.status !== "open") {
			setTimeRemaining(null);
			return;
		}

		const updateTimer = () => {
			const closesAt = new Date(currentLot.closesAt!).getTime();
			const now = Date.now();
			const remaining = Math.max(0, Math.floor((closesAt - now) / 1000));
			setTimeRemaining(remaining);
		};

		updateTimer();
		timerIntervalRef.current = setInterval(updateTimer, 100);

		return () => {
			if (timerIntervalRef.current) {
				clearInterval(timerIntervalRef.current);
			}
		};
	}, [currentLot?.closesAt, currentLot?.status]);

	// WebSocket connection
	useEffect(() => {
		fetch("/api/ws").finally(() => {
			wsRef.current = connectWs(eventId, (msg: Message) => {
				if (msg.type === "bid_placed") {
					const payload = msg.payload as any;
					setState((prev) => {
						if (!prev.currentLot || prev.currentLot.id !== payload.lotId) {
							return prev;
						}
						return {
							...prev,
							currentLot: {
								...prev.currentLot,
								currentBidCents: payload.amountCents,
								highBidderId: payload.playerId,
								closesAt: payload.closesAt ?? prev.currentLot.closesAt,
							},
						};
					});
				}
				if (msg.type === "lot_sold") {
					setState((prev) => {
						if (!prev.currentLot) {
							return prev;
						}
						return {
							...prev,
							currentLot: { ...prev.currentLot, status: "sold" },
						};
					});
				}
				if (msg.type === "lot_opened") {
					const payload = msg.payload as any;
					setState((prev) => {
						if (!prev.currentLot || prev.currentLot.id !== payload.lotId) {
							return prev;
						}
						return {
							...prev,
							currentLot: {
								...prev.currentLot,
								status: "open",
								closesAt: payload.closesAt ?? prev.currentLot.closesAt,
								openedAt: new Date().toISOString(),
							},
						};
					});
				}
			});
		});

		return () => {
			wsRef.current?.close();
		};
	}, [eventId]);

	const handleBid = async () => {
		if (!currentLot || !selectedPlayerId || !bidAmount) return;
		
		const amountCents = Math.round(parseFloat(bidAmount) * 100);
		if (amountCents < minBid * 100) {
			alert(`Bid must be at least $${minBid.toFixed(2)}`);
			return;
		}

		setIsSubmitting(true);
		try {
			const res = await fetch(`/api/lots/${currentLot.id}/bid`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					playerId: selectedPlayerId,
					amountCents,
				}),
			});

			if (!res.ok) {
				const error = await res.json().catch(() => ({}));
				alert(error.error || "Failed to place bid");
			} else {
				setBidAmount("");
			}
		} catch (err) {
			alert("Failed to place bid");
		} finally {
			setIsSubmitting(false);
		}
	};

	const formatTime = (seconds: number | null) => {
		if (seconds === null) return "--:--";
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	const teamDisplay = currentLot?.team.seed
		? `${currentLot.team.name} (${currentLot.team.region} #${currentLot.team.seed})`
		: currentLot?.team.name ?? "Waiting for next team...";

	const highBidder = currentLot?.highBidderId
		? state.players.find((p) => p.id === currentLot.highBidderId)?.name ?? "—"
		: "—";

	return (
		<div
			style={{
				minHeight: "100vh",
				backgroundColor: "#ffffff",
				color: "#1a1a1a",
				fontFamily: "system-ui, -apple-system, sans-serif",
				padding: "24px",
			}}
		>
			<div style={{ maxWidth: "800px", margin: "0 auto" }}>
				{/* Header */}
				<div style={{ marginBottom: "32px", textAlign: "center" }}>
					<h1 style={{ margin: 0, fontSize: "clamp(24px, 5vw, 36px)", fontWeight: 700, color: "#1a1a1a" }}>
						{state.event.name}
					</h1>
				</div>

				{/* Main Auction Card */}
				<div
					style={{
						backgroundColor: "#f9fafb",
						borderRadius: "16px",
						padding: "clamp(24px, 6vw, 48px)",
						border: "2px solid #e5e7eb",
						marginBottom: "24px",
						boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
					}}
				>
					{/* Current Team */}
					<div style={{ marginBottom: "32px", textAlign: "center" }}>
						<div
							style={{
								fontSize: "clamp(12px, 2vw, 14px)",
								color: "#6b7280",
								marginBottom: "12px",
								textTransform: "uppercase",
								letterSpacing: "1px",
								fontWeight: 600,
							}}
						>
							Current Team
						</div>
						<div
							style={{
								fontSize: "clamp(32px, 8vw, 56px)",
								fontWeight: 700,
								color: "#1a1a1a",
								lineHeight: 1.2,
							}}
						>
							{teamDisplay}
						</div>
						{currentLot?.team.bracket && (
							<div
								style={{
									marginTop: "8px",
									fontSize: "clamp(14px, 3vw, 18px)",
									color: "#6b7280",
								}}
							>
								{currentLot.team.bracket}
							</div>
						)}
					</div>

					{/* Current Bid */}
					<div style={{ marginBottom: "32px", textAlign: "center" }}>
						<div
							style={{
								fontSize: "clamp(12px, 2vw, 14px)",
								color: "#6b7280",
								marginBottom: "12px",
								textTransform: "uppercase",
								letterSpacing: "1px",
								fontWeight: 600,
							}}
						>
							Current High Bid
						</div>
						<div
							style={{
								fontSize: "clamp(40px, 10vw, 72px)",
								fontWeight: 700,
								color: "#059669",
								lineHeight: 1,
							}}
						>
							${((currentLot?.currentBidCents ?? 0) / 100).toFixed(2)}
						</div>
						<div
							style={{
								marginTop: "12px",
								fontSize: "clamp(16px, 4vw, 20px)",
								color: "#4b5563",
							}}
						>
							High Bidder: <span style={{ fontWeight: 600 }}>{highBidder}</span>
						</div>
					</div>

					{/* Timer */}
					{currentLot?.status === "open" && (
						<div style={{ marginBottom: "32px", textAlign: "center" }}>
							<div
								style={{
									fontSize: "clamp(12px, 2vw, 14px)",
									color: "#6b7280",
									marginBottom: "12px",
									textTransform: "uppercase",
									letterSpacing: "1px",
									fontWeight: 600,
								}}
							>
								Time Remaining
							</div>
							<div
								style={{
									fontSize: "clamp(48px, 12vw, 96px)",
									fontWeight: 700,
									color: timeRemaining !== null && timeRemaining < 10 ? "#dc2626" : "#2563eb",
									lineHeight: 1,
									fontVariantNumeric: "tabular-nums",
								}}
							>
								{formatTime(timeRemaining)}
							</div>
						</div>
					)}

					{/* Bid Input */}
					{currentLot?.status === "open" && (
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: "16px",
								maxWidth: "400px",
								margin: "0 auto",
							}}
						>
							<select
								value={selectedPlayerId}
								onChange={(e) => setSelectedPlayerId(e.target.value)}
								style={{
									padding: "16px",
									fontSize: "clamp(16px, 4vw, 20px)",
									borderRadius: "8px",
									border: "2px solid #d1d5db",
									backgroundColor: "#fff",
									color: "#1a1a1a",
								}}
							>
								<option value="">Select your name</option>
								{state.players.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</select>
							<div style={{ display: "flex", gap: "12px" }}>
								<input
									type="number"
									value={bidAmount}
									onChange={(e) => setBidAmount(e.target.value)}
									placeholder={`Min: $${minBid.toFixed(2)}`}
									min={minBid}
									step="0.01"
									style={{
										flex: 1,
										padding: "16px",
										fontSize: "clamp(16px, 4vw, 20px)",
										borderRadius: "8px",
										border: "2px solid #d1d5db",
										backgroundColor: "#fff",
									}}
								/>
								<button
									onClick={handleBid}
									disabled={!selectedPlayerId || !bidAmount || isSubmitting}
									style={{
										padding: "16px 32px",
										fontSize: "clamp(16px, 4vw, 20px)",
										fontWeight: 600,
										backgroundColor: selectedPlayerId && bidAmount ? "#2563eb" : "#9ca3af",
										color: "#fff",
										border: "none",
										borderRadius: "8px",
										cursor: selectedPlayerId && bidAmount ? "pointer" : "not-allowed",
										transition: "background-color 0.2s",
									}}
									onMouseOver={(e) => {
										if (selectedPlayerId && bidAmount) {
											e.currentTarget.style.backgroundColor = "#1d4ed8";
										}
									}}
									onMouseOut={(e) => {
										if (selectedPlayerId && bidAmount) {
											e.currentTarget.style.backgroundColor = "#2563eb";
										}
									}}
								>
									{isSubmitting ? "Submitting..." : "Bid"}
								</button>
							</div>
							<div
								style={{
									fontSize: "clamp(12px, 2.5vw, 14px)",
									color: "#6b7280",
									textAlign: "center",
								}}
							>
								Minimum bid: <strong>${minBid.toFixed(2)}</strong>
							</div>
						</div>
					)}

					{currentLot?.status === "pending" && (
						<div
							style={{
								textAlign: "center",
								fontSize: "clamp(18px, 4vw, 24px)",
								color: "#6b7280",
								padding: "24px",
							}}
						>
							Waiting for auction to start...
						</div>
					)}

					{currentLot?.status === "sold" && (
						<div
							style={{
								textAlign: "center",
								fontSize: "clamp(18px, 4vw, 24px)",
								color: "#059669",
								padding: "24px",
								fontWeight: 600,
							}}
						>
							Sold to {highBidder} for ${((currentLot?.currentBidCents ?? 0) / 100).toFixed(2)}
						</div>
					)}
				</div>

				{/* Secondary Info (Collapsible on mobile) */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
						gap: "16px",
						marginTop: "24px",
					}}
				>
					{/* Status Card */}
					<div
						style={{
							backgroundColor: "#f9fafb",
							borderRadius: "12px",
							padding: "20px",
							border: "1px solid #e5e7eb",
						}}
					>
						<div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "8px", fontWeight: 600 }}>
							Status
						</div>
						<div style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a" }}>
							{currentLot?.status === "open"
								? "Live"
								: currentLot?.status === "pending"
									? "Pending"
									: "Sold"}
						</div>
					</div>

					{/* Next Team Card */}
					{currentLot && (
						<div
							style={{
								backgroundColor: "#f9fafb",
								borderRadius: "12px",
								padding: "20px",
								border: "1px solid #e5e7eb",
							}}
						>
							<div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "8px", fontWeight: 600 }}>
								Next Team
							</div>
							<div style={{ fontSize: "18px", fontWeight: 600, color: "#1a1a1a" }}>
								Coming soon...
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

