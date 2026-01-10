"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { connectWs, type Message, type ConnectionStatus } from "../client/wsClient";
import { AuctionTimeline } from "./AuctionTimeline";
import { playBuzzer, playWarningBeep, initAudio } from "../lib/audioEffects";

type Team = { id: string; name: string; seed?: number | null; region?: string | null; bracket?: string | null };
type Lot = {
	id: string;
	orderIndex: number;
	status: "pending" | "open" | "sold";
	currentBidCents: number;
	highBidderId: string | null;
	openedAt: string | null;
	closesAt: string | null;
	pausedAt: string | null;
	pauseDurationSeconds: number;
	team: Team;
};

type SoldLot = {
	lotId: string;
	teamName: string;
	playerId: string;
	playerName: string;
	amountCents: number;
	soldAt: string;
};

type AuctionState = {
	event: { id: string; name: string; status: string };
	ruleSet: { minIncrementCents: number; intermissionSeconds: number } | null;
	currentLot: Lot | null;
	players: Array<{ id: string; name: string }>;
	soldLots?: SoldLot[];
};

export function AudienceView({ eventId, initialState }: { eventId: string; initialState: AuctionState }) {
	const [state, setState] = useState<AuctionState>(initialState);
	const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
	const [refreshCountdown, setRefreshCountdown] = useState<number | null>(null);
	const [isMobile, setIsMobile] = useState(false);
	const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
	const [lockedPlayerId, setLockedPlayerId] = useState<string | null>(null);
	const [playerToken, setPlayerToken] = useState<string | null>(null);
	const [tokenStatus, setTokenStatus] = useState<"pending" | "valid" | "invalid" | null>(null);
	const [bidAmount, setBidAmount] = useState<string>("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [bidAnimation, setBidAnimation] = useState<{ playerName: string; amountCents: number } | null>(null);
	const [previousBidAmount, setPreviousBidAmount] = useState<number>(initialState.currentLot?.currentBidCents ?? 0);
	const [wsStatus, setWsStatus] = useState<ConnectionStatus>("connecting");
	const wsConnectionRef = useRef<ReturnType<typeof connectWs> | null>(null);
	const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const refreshCountdownRef = useRef<NodeJS.Timeout | null>(null);
	const buzzerPlayedRef = useRef<boolean>(false);
	const warningPlayedRef = useRef<boolean>(false);
	const currentLotIdRef = useRef<string | null>(null);
	const searchParams = useSearchParams();
	const isHostMode = searchParams.get("host") === "1" || searchParams.get("mode") === "host";
	const lockedPlayerName = lockedPlayerId
		? state.players.find((p) => p.id === lockedPlayerId)?.name ?? "Player"
		: null;
	
	// Initialize audio on first user interaction
	useEffect(() => {
		if (typeof window === "undefined") return;

		const initOnClick = () => {
			initAudio();
			document.removeEventListener('click', initOnClick);
		};

		document.addEventListener('click', initOnClick);

		return () => {
			document.removeEventListener('click', initOnClick);
		};
	}, []);

	// Reset buzzer flags when lot changes
	useEffect(() => {
		if (currentLot?.id !== currentLotIdRef.current) {
			currentLotIdRef.current = currentLot?.id ?? null;
			buzzerPlayedRef.current = false;
			warningPlayedRef.current = false;
		}
	}, [state.currentLot?.id]);

	// Mobile-only UI helpers (do not change desktop behavior)
	useEffect(() => {
		if (typeof window === "undefined") return;
		const mq = window.matchMedia("(max-width: 900px)");
		const update = () => setIsMobile(mq.matches);
		update();
		if (mq.addEventListener) mq.addEventListener("change", update);
		// eslint-disable-next-line deprecation/deprecation
		else mq.addListener(update);
		return () => {
			if (mq.removeEventListener) mq.removeEventListener("change", update);
			// eslint-disable-next-line deprecation/deprecation
			else mq.removeListener(update);
		};
	}, []);

	// Function to refetch state from API
	const refetchState = async () => {
		try {
			const res = await fetch(`/api/events/${eventId}/state`);
			if (res.ok) {
				const newState = await res.json();
				setState({
					event: newState.event,
					ruleSet: newState.ruleSet,
					currentLot: newState.currentLot,
					players: newState.players,
					soldLots: newState.soldLots ?? [],
				});
				// Clear refresh countdown when state is refreshed
				setRefreshCountdown(null);
				if (refreshCountdownRef.current) {
					clearInterval(refreshCountdownRef.current);
					refreshCountdownRef.current = null;
				}
			}
		} catch (err) {
			console.error("Failed to refetch state:", err);
		}
	};

	const currentLot = state.currentLot;
	const minBid = currentLot
		? (currentLot.currentBidCents + (state.ruleSet?.minIncrementCents ?? 100)) / 100
		: 0;
	const button = {
		base: {
			borderRadius: 10,
			border: "2px solid transparent",
			fontWeight: 700,
			cursor: "pointer",
			transition: "transform 120ms ease, box-shadow 120ms ease, background 120ms ease",
		} as const,
		primary: {
			backgroundColor: "#2563eb",
			color: "#fff",
			boxShadow: "0 10px 24px rgba(37,99,235,0.25)",
		},
		disabled: {
			backgroundColor: "#9ca3af",
			color: "#f8fafc",
			cursor: "not-allowed",
			boxShadow: "none",
		},
	};

	// Timer calculation with pause support
	useEffect(() => {
		// Clear any existing interval first to prevent overlapping
		if (timerIntervalRef.current) {
			clearInterval(timerIntervalRef.current);
			timerIntervalRef.current = null;
		}

		if (!currentLot?.closesAt || currentLot.status !== "open") {
			setTimeRemaining(null);
			return;
		}

		const updateTimer = () => {
			if (!currentLot.closesAt) {
				setTimeRemaining(null);
				return;
			}

			// If paused, calculate remaining time from when it was paused
			if (currentLot.pausedAt) {
				const pausedAt = new Date(currentLot.pausedAt).getTime();
				const closesAt = new Date(currentLot.closesAt).getTime();
				// Time remaining = closesAt - pausedAt (frozen at pause time)
				const remaining = Math.max(0, Math.floor((closesAt - pausedAt) / 1000));
				setTimeRemaining(remaining);
				return;
			}

			// Not paused: calculate normally
			const closesAt = new Date(currentLot.closesAt).getTime();
			const now = Date.now();
			const remaining = Math.max(0, Math.floor((closesAt - now) / 1000));
			setTimeRemaining(remaining);

			// Play warning beep at 10 seconds (once)
			if (remaining === 10 && !warningPlayedRef.current && !currentLot.pausedAt) {
				warningPlayedRef.current = true;
				playWarningBeep();
			}

			// Play buzzer when timer expires (once)
			if (remaining === 0 && !buzzerPlayedRef.current && !currentLot.pausedAt) {
				buzzerPlayedRef.current = true;
				playBuzzer();
			}
		};

		updateTimer();
		timerIntervalRef.current = setInterval(updateTimer, 100);

		return () => {
			if (timerIntervalRef.current) {
				clearInterval(timerIntervalRef.current);
				timerIntervalRef.current = null;
			}
		};
	}, [currentLot?.closesAt, currentLot?.status, currentLot?.pausedAt]);

	// WebSocket connection with reconnection
	useEffect(() => {
		fetch("/api/ws").finally(() => {
			wsConnectionRef.current = connectWs(
				eventId,
				(msg: Message) => {
				if (msg.type === "bid_placed") {
					const payload = msg.payload as any;
					setState((prev) => {
						if (!prev.currentLot || prev.currentLot.id !== payload.lotId) {
							return prev;
						}
						
						// Trigger animation for new bid
						const playerName = prev.players.find((p) => p.id === payload.playerId)?.name ?? "Unknown";
						setBidAnimation({ playerName, amountCents: payload.amountCents });
						setPreviousBidAmount(prev.currentLot.currentBidCents);
						
						// Clear animation after 2 seconds
						setTimeout(() => setBidAnimation(null), 2000);
						
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
					const payload = msg.payload as any;
					setState((prev) => {
						if (!prev.currentLot) {
							return prev;
						}
						return {
							...prev,
							currentLot: { ...prev.currentLot, status: "sold" },
						};
					});
					// Clear bid input when team is sold
					setBidAmount("");
					setSelectedPlayerId("");
					
					// Clear any existing countdown
					if (refreshCountdownRef.current) {
						clearInterval(refreshCountdownRef.current);
					}
					
					// Start intermission countdown before auto-refreshing (defaults to 30s)
					setRefreshCountdown(state.ruleSet?.intermissionSeconds ?? 30);
					refreshCountdownRef.current = setInterval(() => {
						setRefreshCountdown((prev) => {
							if (prev === null || prev <= 1) {
								if (refreshCountdownRef.current) {
									clearInterval(refreshCountdownRef.current);
									refreshCountdownRef.current = null;
								}
								// Refetch after countdown completes
								setTimeout(() => {
									refetchState();
								}, 500);
								return null;
							}
							return prev - 1;
						});
					}, 1000);
				}
				if (msg.type === "lot_opened") {
					const payload = msg.payload as any;
					// Clear countdown if host manually opens next team
					if (refreshCountdownRef.current) {
						clearInterval(refreshCountdownRef.current);
						refreshCountdownRef.current = null;
					}
					setRefreshCountdown(null);
					// Always refetch state when a lot opens to ensure we have the latest data
					// This handles both the current lot opening and the next team being opened
					refetchState();
				}
				if (msg.type === "timer_paused" || msg.type === "timer_resumed") {
					const payload = msg.payload as any;
					setState((prev) => {
						if (!prev.currentLot || prev.currentLot.id !== payload.lotId) {
							return prev;
						}
						return {
							...prev,
							currentLot: {
								...prev.currentLot,
								pausedAt: payload.pausedAt,
								closesAt: payload.closesAt ?? prev.currentLot.closesAt,
								pauseDurationSeconds: payload.pauseDurationSeconds ?? prev.currentLot.pauseDurationSeconds,
							},
						};
					});
				}
				},
				(status: ConnectionStatus) => {
					setWsStatus(status);
				},
			);

			return () => {
				wsConnectionRef.current?.close();
				if (refreshCountdownRef.current) {
					clearInterval(refreshCountdownRef.current);
				}
			};
		});
	}, [eventId]);

	// Invite link token validation and locking
	useEffect(() => {
		const player = searchParams.get("player");
		const token = searchParams.get("token");
		if (!player || !token) {
			setLockedPlayerId(null);
			setPlayerToken(null);
			setTokenStatus(null);
			return;
		}
		setTokenStatus("pending");
		fetch(`/api/events/${eventId}/player-validate?playerId=${player}&token=${token}`)
			.then((res) => {
				if (res.ok) return true;
				return false;
			})
			.then((ok) => {
				if (ok) {
					setLockedPlayerId(player);
					setSelectedPlayerId(player);
					setPlayerToken(token);
					setTokenStatus("valid");
				} else {
					setTokenStatus("invalid");
				}
			})
			.catch(() => setTokenStatus("invalid"));
	}, [eventId, searchParams]);

	const handleBid = async () => {
		if (!currentLot || !selectedPlayerId || !bidAmount) return;
		
		// Prevent participants from bidding when timer is at 0
		if (timeRemaining === 0 && !isHostMode) {
			alert("Bidding is closed. Only the host can place bids when the timer reaches 0.");
			return;
		}
		
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
					token: playerToken ?? undefined,
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
	
	const handleSellTeam = async () => {
		if (!currentLot || currentLot.status !== "open") return;
		if (!currentLot.highBidderId) {
			alert("No bid to accept");
			return;
		}
		if (isSubmitting) return;
		setIsSubmitting(true);
		try {
			const res = await fetch(`/api/lots/${currentLot.id}/accept`, { method: "POST" });
			const json = await res.json().catch(() => ({}));
			if (!res.ok) {
				alert(json.error || "Failed to sell team");
				return;
			}
		} catch {
			alert("Failed to sell team");
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
	
	const soldLots = state.soldLots ?? [];

	return (
		<div
			style={{
				minHeight: "100vh",
				backgroundColor: "#ffffff",
				color: "#1a1a1a",
				fontFamily: "system-ui, -apple-system, sans-serif",
				position: "relative",
			}}
		>
			<style dangerouslySetInnerHTML={{
				__html: `
					@keyframes bidPopup {
						0% {
							opacity: 0;
							transform: translate(-50%, -50%) scale(0.8);
						}
						15% {
							opacity: 1;
							transform: translate(-50%, -50%) scale(1.1);
						}
						30% {
							transform: translate(-50%, -50%) scale(1);
						}
						85% {
							opacity: 1;
							transform: translate(-50%, -50%) scale(1);
						}
						100% {
							opacity: 0;
							transform: translate(-50%, -50%) scale(0.9);
						}
					}
					@keyframes bidIncrease {
						from {
							transform: scale(1);
							color: #059669;
						}
						50% {
							transform: scale(1.2);
							color: #10b981;
						}
						to {
							transform: scale(1);
							color: #059669;
						}
					}
					.bid-popup-animation {
						animation: bidPopup 2s ease-out forwards;
					}
					.bid-increase-animation {
						animation: bidIncrease 0.6s ease-out;
					}
				`
			}} />
			{/* Bid Animation Overlay */}
				{bidAnimation && (
					<div
						className="bid-popup-animation"
						style={{
							position: "fixed",
							top: "50%",
							left: "50%",
							transform: "translate(-50%, -50%)",
							zIndex: 1000,
							pointerEvents: "none",
						}}
					>
						<div
							style={{
								backgroundColor: "#059669",
								color: "#fff",
								padding: "24px 48px",
								borderRadius: "16px",
								boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
								textAlign: "center",
							}}
						>
							<div style={{ fontSize: "32px", fontWeight: 700, marginBottom: "8px" }}>
								{bidAnimation.playerName}
							</div>
							<div style={{ fontSize: "24px", opacity: 0.9 }}>
								${(bidAnimation.amountCents / 100).toFixed(2)}
							</div>
						</div>
					</div>
				)}
				<AuctionTimeline currentStep="auction" eventId={eventId} />
				<div style={{ padding: "24px" }}>
			<div style={{ maxWidth: "800px", margin: "0 auto" }}>
				{/* Header */}
				<div style={{ marginBottom: "32px", textAlign: "center" }}>
					<h1 style={{ margin: 0, fontSize: "clamp(24px, 5vw, 36px)", fontWeight: 700, color: "#1a1a1a" }}>
						{state.event.name}
					</h1>
					{tokenStatus === "valid" && lockedPlayerName && (
						<div
							style={{
								marginTop: "12px",
								display: "inline-flex",
								alignItems: "center",
								gap: "10px",
								padding: "10px 16px",
								borderRadius: "999px",
								background: "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(16,185,129,0.25))",
								color: "#065f46",
								fontWeight: 800,
								fontSize: "15px",
								letterSpacing: "0.3px",
								border: "2px solid #22c55e",
								boxShadow: "0 10px 25px rgba(34,197,94,0.25)",
								textTransform: "uppercase",
							}}
						>
							<span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#22c55e", boxShadow: "0 0 0 4px rgba(34,197,94,0.25)" }} />
							<span>{lockedPlayerName}</span>
						</div>
					)}
					{tokenStatus === "invalid" && (
						<div
							style={{
								marginTop: "10px",
								display: "inline-flex",
								alignItems: "center",
								gap: "6px",
								padding: "8px 12px",
								borderRadius: "999px",
								backgroundColor: "#fef2f2",
								color: "#b91c1c",
								fontWeight: 600,
								fontSize: "14px",
								border: "1px solid #f87171",
							}}
						>
							<span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#f87171" }} />
							<span>Invite link invalid</span>
						</div>
					)}
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
							key={currentLot?.currentBidCents}
							className={bidAnimation ? "bid-increase-animation" : ""}
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
							{timeRemaining === 0 && !isHostMode ? (
								<div
									style={{
										padding: "16px",
										backgroundColor: "#fef2f2",
										border: "2px solid #dc2626",
										borderRadius: "8px",
										textAlign: "center",
									}}
								>
									<div
										style={{
											fontSize: "clamp(14px, 3vw, 18px)",
											color: "#dc2626",
											fontWeight: 600,
										}}
									>
										Bidding Closed
									</div>
									<div
										style={{
											fontSize: "clamp(12px, 2.5vw, 14px)",
											color: "#991b1b",
											marginTop: "8px",
										}}
									>
										Only the host can place bids when the timer reaches 0.
									</div>
								</div>
							) : (
								<>
									{isHostMode && timeRemaining === 0 && (
										<div
											style={{
												padding: "14px",
												backgroundColor: "#fffbeb",
												border: "2px solid #f59e0b",
												borderRadius: "10px",
											}}
										>
											<div style={{ fontSize: "14px", fontWeight: 700, color: "#92400e" }}>
												Host Controls
											</div>
											<div style={{ fontSize: "12px", color: "#92400e", marginTop: "6px" }}>
												Timer is at 0 — you can still finalize the current team here.
											</div>
											<button
												onClick={handleSellTeam}
												disabled={!currentLot.highBidderId || isSubmitting}
												style={{
													marginTop: "10px",
													width: "100%",
													padding: "14px 18px",
													fontSize: "16px",
													fontWeight: 700,
													borderRadius: "10px",
													border: "none",
													backgroundColor: currentLot.highBidderId ? "#16a34a" : "#9ca3af",
													color: "#fff",
													cursor: currentLot.highBidderId && !isSubmitting ? "pointer" : "not-allowed",
													opacity: isSubmitting ? 0.85 : 1,
												}}
											>
												{isSubmitting ? "Selling..." : "Sell Team & Advance"}
											</button>
										</div>
									)}
									{lockedPlayerId ? null : tokenStatus === "pending" ? (
										<div style={{ textAlign: "center", fontSize: "14px", color: "#1d4ed8" }}>
											Verifying invite link...
										</div>
									) : tokenStatus === "invalid" ? (
										<div style={{ textAlign: "center", fontSize: "14px", color: "#b91c1c" }}>
											Invite link is invalid. Please ask the host for a new link.
										</div>
									) : (
										<select
											value={selectedPlayerId}
											onChange={(e) => setSelectedPlayerId(e.target.value)}
											aria-label="Select your name"
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
									)}
									<div style={{ display: "flex", gap: "12px" }}>
										<input
											type="number"
											value={bidAmount}
											onChange={(e) => setBidAmount(e.target.value)}
											placeholder={`Min: $${minBid.toFixed(2)}`}
											min={minBid}
											step="1"
											aria-label="Bid amount in dollars"
											aria-describedby="min-bid-hint"
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
												...(selectedPlayerId && bidAmount ? { ...button.base, ...button.primary } : { ...button.base, ...button.disabled }),
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
											aria-label="Place bid"
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
										id="min-bid-hint"
										aria-live="polite"
									>
										Minimum bid: <strong>${minBid.toFixed(2)}</strong>
									</div>
								</>
							)}
						</div>
					)}
					
					{/* Mobile-only: show won/owned teams for host mode so they don't need to jump to Results */}
					{isHostMode && isMobile && (
						<div
							style={{
								marginTop: "18px",
								padding: "16px",
								borderRadius: "12px",
								border: "1px solid #e5e7eb",
								backgroundColor: "#f8fafc",
								maxWidth: "520px",
								marginLeft: "auto",
								marginRight: "auto",
							}}
						>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px" }}>
								<div style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a" }}>Owned Teams</div>
								<div style={{ fontSize: "12px", color: "#475569" }}>{soldLots.length} total</div>
							</div>
							{soldLots.length === 0 ? (
								<div style={{ marginTop: "10px", fontSize: "13px", color: "#64748b" }}>
									No teams sold yet.
								</div>
							) : (
								<div style={{ marginTop: "10px", display: "grid", gap: "10px" }}>
									{soldLots.slice(0, 12).map((s) => (
										<div
											key={s.lotId}
											style={{
												padding: "12px",
												borderRadius: "12px",
												border: "1px solid #e2e8f0",
												backgroundColor: "#ffffff",
											}}
										>
											<div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
												<div style={{ minWidth: 0 }}>
													<div style={{ fontWeight: 800, color: "#0f172a", fontSize: "14px" }}>{s.teamName}</div>
													<div style={{ marginTop: "2px", fontSize: "12px", color: "#475569" }}>{s.playerName}</div>
												</div>
												<div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
													<div style={{ fontWeight: 900, color: "#16a34a", fontSize: "14px" }}>
														${(s.amountCents / 100).toFixed(2)}
													</div>
													<div style={{ marginTop: "2px", fontSize: "11px", color: "#64748b" }}>
														{new Date(s.soldAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
													</div>
												</div>
											</div>
										</div>
									))}
									{soldLots.length > 12 && (
										<div style={{ fontSize: "12px", color: "#64748b", textAlign: "center" }}>
											…and {soldLots.length - 12} more (see Results for full list)
										</div>
									)}
								</div>
							)}
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
								padding: "24px",
							}}
						>
							<div
								style={{
									fontSize: "clamp(18px, 4vw, 24px)",
									color: "#059669",
									fontWeight: 600,
									marginBottom: refreshCountdown !== null ? "16px" : "0",
								}}
							>
								Sold to {highBidder} for ${((currentLot?.currentBidCents ?? 0) / 100).toFixed(2)}
							</div>
							{refreshCountdown !== null && (
								<div
									style={{
										fontSize: "clamp(14px, 3vw, 18px)",
										color: "#6b7280",
										fontWeight: 500,
									}}
								>
									Next team in {refreshCountdown} seconds...
								</div>
							)}
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
		</div>
	);
}
