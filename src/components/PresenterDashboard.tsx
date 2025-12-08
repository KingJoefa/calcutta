"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { connectWs, type Message, type ConnectionStatus } from "../client/wsClient";
import { AuctionTimeline } from "./AuctionTimeline";

type Player = { id: string; name: string; handle?: string | null };
type Team = { id: string; name: string; seed?: number | null; region?: string | null; bracket?: string | null };
type Lot = {
	id: string;
	orderIndex: number;
	status: "pending" | "open" | "sold";
	currentBidCents: number;
	highBidderId: string | null;
	acceptedBidderId: string | null;
	openedAt: string | null;
	closesAt: string | null;
	pausedAt: string | null;
	pauseDurationSeconds: number;
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
	ruleSet: { auctionTimerSeconds: number; antiSnipeExtensionSeconds: number; minIncrementCents: number } | null;
	players: Player[];
	lots: Lot[];
	currentLot: Lot | null;
	recentBids: Bid[];
	soldLots?: SoldLot[];
};

export function PresenterDashboard({ eventId, initialState }: { eventId: string; initialState: AuctionState }) {
	const [state, setState] = useState<AuctionState>(initialState);
	const [bidHistory, setBidHistory] = useState<Bid[]>(initialState.recentBids ?? []);
	const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
	const [refreshCountdown, setRefreshCountdown] = useState<number | null>(null);
	const [isPaused, setIsPaused] = useState(false);
	const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
	const [bidAmount, setBidAmount] = useState<number>(0);
	const [bidInputValue, setBidInputValue] = useState<string>("");
	const [showTeamImport, setShowTeamImport] = useState(initialState.lots.length === 0);
	const [isSubmittingBid, setIsSubmittingBid] = useState(false);
	const [sidebarWidth, setSidebarWidth] = useState<number>(600); // Default width in pixels
	const [isResizing, setIsResizing] = useState(false);
	const [showNextTeamPreview, setShowNextTeamPreview] = useState(false);
	const [wsStatus, setWsStatus] = useState<ConnectionStatus>("connecting");
	const wsConnectionRef = useRef<ReturnType<typeof connectWs> | null>(null);
	const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const refreshCountdownRef = useRef<NodeJS.Timeout | null>(null);
	const resizeStartXRef = useRef<number>(0);
	const resizeStartWidthRef = useRef<number>(0);

	const currentLot = state.currentLot;
	
	// Find next pending team (only used when showNextTeamPreview is true)
	const nextPendingLot = useMemo(() => {
		if (!showNextTeamPreview) return null;
		return state.lots.find((l) => l.status === "pending") ?? null;
	}, [state.lots, showNextTeamPreview]);
	
	// Check if all teams are sold (all lots have status "sold")
	const allTeamsSold = useMemo(() => {
		return state.lots.length > 0 && state.lots.every((lot) => lot.status === "sold");
	}, [state.lots]);
	
	const highBidder = currentLot?.highBidderId
		? state.players.find((p) => p.id === currentLot.highBidderId)?.name ?? "Unknown"
		: null;

	// Reset bid input when lot changes
	useEffect(() => {
		setBidAmount(0);
		setBidInputValue("");
		setSelectedPlayerId(null);
		// Reset pause state when lot changes
		setIsPaused(false);
	}, [currentLot?.id]);

	// Sync pause state from currentLot
	useEffect(() => {
		if (currentLot) {
			setIsPaused(currentLot.pausedAt !== null);
		} else {
			setIsPaused(false);
		}
	}, [currentLot?.pausedAt]);

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
						// Only process if this is for the current open lot
						if (!prev.currentLot || prev.currentLot.id !== payload.lotId || prev.currentLot.status !== "open") {
							return prev;
						}

						const updatedLots = prev.lots.map((l) =>
							l.id === payload.lotId
								? {
										...l,
										currentBidCents: payload.amountCents,
										highBidderId: payload.playerId,
										// If there's an accepted bidder, update it to the new high bidder
										acceptedBidderId: l.acceptedBidderId ? payload.playerId : l.acceptedBidderId,
										closesAt: payload.closesAt ?? l.closesAt,
									}
								: l,
						);
						const updatedCurrentLot = {
							...prev.currentLot,
							currentBidCents: payload.amountCents,
							highBidderId: payload.playerId,
							// If there's an accepted bidder, update it to the new high bidder
							acceptedBidderId: prev.currentLot.acceptedBidderId ? payload.playerId : prev.currentLot.acceptedBidderId,
							closesAt: payload.closesAt ?? prev.currentLot.closesAt,
						};
						return {
							...prev,
							lots: updatedLots,
							currentLot: updatedCurrentLot,
							recentBids: [
								{
									id: `temp-${Date.now()}`,
									lotId: payload.lotId,
									playerId: payload.playerId,
									playerName: prev.players.find((p) => p.id === payload.playerId)?.name ?? "Unknown",
									amountCents: payload.amountCents,
									createdAt: new Date().toISOString(),
									teamName: prev.currentLot.team.name,
								},
								...prev.recentBids.slice(0, 49),
							],
						};
					});

					setBidHistory((prev) => [
						{
							id: `hist-${Date.now()}`,
							lotId: payload.lotId,
							playerId: payload.playerId,
							playerName: state.players.find((p) => p.id === payload.playerId)?.name ?? "Unknown",
							amountCents: payload.amountCents,
							createdAt: new Date().toISOString(),
							teamName: state.currentLot?.team.name ?? "",
						},
						...prev,
					]);
				}
				if (msg.type === "lot_sold") {
					const payload = msg.payload as any;
					setState((prev) => {
						const updatedLots = prev.lots.map((l) =>
							l.id === payload.lotId ? { ...l, status: "sold" as const } : l,
						);
						
						// Find next lot (use nextLotId from payload if available, otherwise find first pending)
						const nextLot = payload.nextLotId 
							? updatedLots.find((l) => l.id === payload.nextLotId) ?? null
							: updatedLots.find((l) => l.status === "pending") ?? null;
						
						// Add sold lot to soldLots array
						const soldLot: SoldLot = {
							lotId: payload.lotId,
							teamName: payload.teamName ?? prev.currentLot?.team.name ?? "Unknown",
							playerId: payload.playerId,
							playerName: payload.playerName ?? prev.players.find((p) => p.id === payload.playerId)?.name ?? "Unknown",
							amountCents: payload.amountCents,
							soldAt: new Date().toISOString(),
						};
						
						const updatedSoldLots = [soldLot, ...(prev.soldLots ?? [])];
						
						// Clear recent bids (only keep bids for current lot if it's open)
						const clearedBids = nextLot && nextLot.status === "open" 
							? prev.recentBids.filter((b) => b.lotId === nextLot.id)
							: [];
						
						// Check if there's a pending lot that's not the current lot
						const nextPending = updatedLots.find((l) => l.status === "pending" && l.id !== nextLot?.id);
						
						// If next lot is pending, keep currentLot as the sold lot until countdown finishes
						// Otherwise, set currentLot to nextLot immediately
						const shouldWaitForCountdown = nextLot?.status === "pending" && nextPending;
						
						const updatedState = {
							...prev,
							lots: updatedLots,
							// Keep showing sold lot if we're waiting for countdown, otherwise show next lot
							currentLot: shouldWaitForCountdown ? prev.currentLot : nextLot,
							recentBids: clearedBids,
							soldLots: updatedSoldLots,
						};
						
						// Start countdown if next lot is pending (not automatically opened)
						if (shouldWaitForCountdown) {
							// Clear any existing countdown
							if (refreshCountdownRef.current) {
								clearInterval(refreshCountdownRef.current);
							}
							
							// Hide preview until countdown finishes
							setShowNextTeamPreview(false);
							
							// Start 30-second countdown
							setRefreshCountdown(30);
							refreshCountdownRef.current = setInterval(() => {
								setRefreshCountdown((prev) => {
									if (prev === null || prev <= 1) {
										if (refreshCountdownRef.current) {
											clearInterval(refreshCountdownRef.current);
											refreshCountdownRef.current = null;
										}
										// Update currentLot to next pending lot and show preview when countdown finishes
										setState((prevState) => {
											const nextPendingLot = prevState.lots.find((l) => l.status === "pending");
											return {
												...prevState,
												currentLot: nextPendingLot ?? null,
											};
										});
										setShowNextTeamPreview(true);
										return null;
									}
									return prev - 1;
								});
							}, 1000);
						} else {
							// Clear countdown if next lot is already open
							if (refreshCountdownRef.current) {
								clearInterval(refreshCountdownRef.current);
								refreshCountdownRef.current = null;
							}
							setRefreshCountdown(null);
							// Don't show preview if next lot is already open
							setShowNextTeamPreview(false);
						}
						
						return updatedState;
					});
				}
				if (msg.type === "lot_opened") {
					const payload = msg.payload as any;
					setState((prev) => {
						const updatedLots = prev.lots.map((l) =>
							l.id === payload.lotId
								? {
										...l,
										status: "open" as const,
										closesAt: payload.closesAt ?? l.closesAt,
										openedAt: new Date().toISOString(),
										acceptedBidderId: null, // Clear accepted bidder when opening
										pausedAt: null, // Reset pause state when opening new lot
										pauseDurationSeconds: 0,
									}
								: l,
						);
						const newCurrentLot = updatedLots.find((l) => l.id === payload.lotId) ?? null;
						// Clear recent bids when opening a new lot
						return {
							...prev,
							lots: updatedLots,
							currentLot: newCurrentLot,
							recentBids: [],
						};
					});
					
					// Clear countdown when a lot is opened
					if (refreshCountdownRef.current) {
						clearInterval(refreshCountdownRef.current);
						refreshCountdownRef.current = null;
					}
					setRefreshCountdown(null);
					
					// Hide next team preview when a new lot is opened
					setShowNextTeamPreview(false);
				}
				if (msg.type === "bid_accepted") {
					const payload = msg.payload as any;
					setState((prev) => {
						const updatedLots = prev.lots.map((l) =>
							l.id === payload.lotId
								? {
										...l,
										acceptedBidderId: payload.playerId,
									}
								: l,
						);
						const updatedCurrentLot =
							prev.currentLot && prev.currentLot.id === payload.lotId
								? {
										...prev.currentLot,
										acceptedBidderId: payload.playerId,
									}
								: prev.currentLot;
						return {
							...prev,
							lots: updatedLots,
							currentLot: updatedCurrentLot,
						};
					});
				}
				if (msg.type === "undo_last") {
					const payload = msg.payload as any;
					// Refetch state to get updated lot status and bids
					fetch(`/api/events/${eventId}/state`)
						.then((res) => res.json())
						.then((newState) => {
							setState({
								event: newState.event,
								ruleSet: newState.ruleSet,
								players: newState.players,
								lots: newState.lots,
								currentLot: newState.currentLot,
								recentBids: newState.recentBids,
								soldLots: newState.soldLots,
							});
						})
						.catch((err) => console.error("Failed to refetch state after undo:", err));
				}
				if (msg.type === "timer_paused" || msg.type === "timer_resumed") {
					const payload = msg.payload as any;
					setState((prev) => {
						const updatedLots = prev.lots.map((l) =>
							l.id === payload.lotId
								? {
										...l,
										pausedAt: payload.pausedAt,
										closesAt: payload.closesAt ?? l.closesAt,
										pauseDurationSeconds: payload.pauseDurationSeconds ?? l.pauseDurationSeconds,
									}
								: l,
						);
						const updatedCurrentLot =
							prev.currentLot && prev.currentLot.id === payload.lotId
								? {
										...prev.currentLot,
										pausedAt: payload.pausedAt,
										closesAt: payload.closesAt ?? prev.currentLot.closesAt,
										pauseDurationSeconds: payload.pauseDurationSeconds ?? prev.currentLot.pauseDurationSeconds,
									}
								: prev.currentLot;
						return {
							...prev,
							lots: updatedLots,
							currentLot: updatedCurrentLot,
						};
					});
				}
			});
		});

		return () => {
			wsConnectionRef.current?.close();
			if (refreshCountdownRef.current) {
				clearInterval(refreshCountdownRef.current);
				refreshCountdownRef.current = null;
			}
		};
	}, [eventId]);

	// Resize handler
	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (!isResizing) return;
			const deltaX = e.clientX - resizeStartXRef.current;
			const newWidth = Math.max(400, Math.min(1200, resizeStartWidthRef.current + deltaX));
			setSidebarWidth(newWidth);
		};

		const handleMouseUp = () => {
			setIsResizing(false);
		};

		if (isResizing) {
			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
		}

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
	}, [isResizing]);

	const handleResizeStart = (e: React.MouseEvent) => {
		e.preventDefault();
		setIsResizing(true);
		resizeStartXRef.current = e.clientX;
		resizeStartWidthRef.current = sidebarWidth;
	};

	const post = async (url: string, body?: any) => {
		const res = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: body ? JSON.stringify(body) : undefined,
		});
		if (!res.ok) {
			const e = await res.json().catch(() => ({}));
			alert(e.error || "Request failed");
			return false;
		}
		return true;
	};

	const handleBid = async (playerId: string, amountCents: number) => {
		if (!currentLot || currentLot.status !== "open" || isSubmittingBid) return;
		
		// Basic client-side check (but don't show alert - let API handle validation with current data)
		const minBid = currentLot.currentBidCents + (state.ruleSet?.minIncrementCents ?? 100);
		if (amountCents < minBid) {
			// Don't show alert here - the API will return a more accurate error with current bid info
			// Just prevent the call if obviously too low
			return;
		}

		setIsSubmittingBid(true);
		const success = await post(`/api/lots/${currentLot.id}/bid`, {
			playerId,
			amountCents,
		});
		setIsSubmittingBid(false);
		
		if (success) {
			setBidAmount(0);
			setBidInputValue("");
			setSelectedPlayerId(null);
		}
	};

	const handleImportTeams = async () => {
		const textarea = document.getElementById("team-import-textarea") as HTMLTextAreaElement;
		if (!textarea) return;
		
		const teams = textarea.value
			.split("\n")
			.map((s) => s.trim())
			.filter(Boolean)
			.map((line) => {
				const seedMatch = line.match(/^(.+?)\s*\(([A-Z]+)\s*#(\d+)\)$/);
				if (seedMatch) {
					return {
						name: seedMatch[1].trim(),
						region: seedMatch[2],
						seed: parseInt(seedMatch[3], 10),
					};
				}
				return { name: line };
			});

		if (teams.length === 0) {
			alert("Please enter at least one team");
			return;
		}

		const success = await post(`/api/events/${eventId}/import-teams`, { teams });
		if (success) {
			window.location.reload();
		}
	};

	const handlePauseToggle = async () => {
		if (!currentLot || currentLot.status !== "open") return;

		try {
			const res = await fetch(`/api/lots/${currentLot.id}/pause`, {
				method: "POST",
			});

			if (!res.ok) {
				const error = await res.json().catch(() => ({}));
				alert(error.error || "Failed to pause/resume timer");
				return;
			}

			// State will be updated via WebSocket broadcast
			// No need to manually update here
		} catch (err) {
			console.error("Error toggling pause:", err);
			alert("Failed to pause/resume timer");
		}
	};

	const handleDownloadRecap = async () => {
		try {
			const res = await fetch(`/api/events/${eventId}/recap`);
			if (!res.ok) {
				const error = await res.json().catch(() => ({}));
				alert(error.error || "Failed to download recap");
				return;
			}

			// Get the CSV content as blob
			const blob = await res.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `recap-${eventId}-${new Date().toISOString().split("T")[0]}.csv`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);
		} catch (err) {
			console.error("Error downloading recap:", err);
			alert("Failed to download recap CSV");
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
		: currentLot?.team.name ?? "No team";

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100vh",
				backgroundColor: "#0a0a0a",
				color: "#e5e5e5",
				fontFamily: "system-ui, -apple-system, sans-serif",
			}}
		>
			{/* WebSocket Reconnection Banner */}
			{(wsStatus === "reconnecting" || wsStatus === "disconnected") && (
				<div
					style={{
						padding: "12px 24px",
						backgroundColor: wsStatus === "reconnecting" ? "#f59e0b" : "#ef4444",
						color: "#000",
						textAlign: "center",
						fontSize: "14px",
						fontWeight: 600,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: "8px",
					}}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M8 4v4m0 4h.01M15 8a7 7 0 11-14 0 7 7 0 0114 0z"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
					{wsStatus === "reconnecting" ? "Reconnecting..." : "Disconnected"}
				</div>
			)}
			<AuctionTimeline currentStep="auction" eventId={eventId} />
			<div
				style={{
					display: "flex",
					flex: 1,
					overflow: "hidden",
				}}
			>
			{/* Left Control Panel */}
			<div
				style={{
					width: `${sidebarWidth}px`,
					minWidth: "400px",
					maxWidth: "1200px",
					borderRight: "1px solid #1f1f1f",
					display: "flex",
					flexDirection: "column",
					backgroundColor: "#111111",
					flexShrink: 0,
				}}
			>
				<div style={{ padding: "32px", borderBottom: "1px solid #1f1f1f" }}>
					<h1 style={{ margin: 0, fontSize: "24px", fontWeight: 600, color: "#f5f5f5" }}>
						{state.event.name}
					</h1>
					<div style={{ marginTop: "8px", fontSize: "14px", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
						<span>Host Dashboard</span>
						<a
							href={`/audience/${eventId}`}
							target="_blank"
							rel="noopener noreferrer"
							style={{
								display: "flex",
								alignItems: "center",
								gap: "6px",
								textDecoration: "none",
								color: "#666",
								fontSize: "12px",
								fontFamily: "monospace",
								textTransform: "none",
								letterSpacing: "0",
								cursor: "pointer",
								transition: "color 0.2s",
							}}
							onMouseOver={(e) => {
								e.currentTarget.style.color = "#888";
							}}
							onMouseOut={(e) => {
								e.currentTarget.style.color = "#666";
							}}
						>
							<span>ID {eventId}</span>
							<svg
								width="12"
								height="12"
								viewBox="0 0 12 12"
								fill="none"
								xmlns="http://www.w3.org/2000/svg"
								style={{ opacity: 0.6 }}
							>
								<path
									d="M2 2h8v8M10 2L2 10"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</a>
					</div>
					{/* Only show download button when all teams are sold */}
					{allTeamsSold && (
						<div style={{ marginTop: "16px" }}>
							<button
								onClick={handleDownloadRecap}
								style={{
									padding: "8px 16px",
									backgroundColor: "#2563eb",
									color: "#fff",
									border: "none",
									borderRadius: "6px",
									fontSize: "13px",
									fontWeight: 600,
									cursor: "pointer",
									display: "flex",
									alignItems: "center",
									gap: "8px",
									transition: "background-color 0.2s",
									width: "100%",
								}}
								onMouseOver={(e) => {
									e.currentTarget.style.backgroundColor = "#1d4ed8";
								}}
								onMouseOut={(e) => {
									e.currentTarget.style.backgroundColor = "#2563eb";
								}}
								title="Download full ledger recap CSV with player spending, teams won, ante paid, and net amounts owed"
							>
								<svg
									width="16"
									height="16"
									viewBox="0 0 16 16"
									fill="none"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path
										d="M8 10L5 7h2V3h2v4h2L8 10zM3 12h10v2H3v-2z"
										fill="currentColor"
									/>
								</svg>
								Download Recap CSV
							</button>
							<div style={{ marginTop: "6px", fontSize: "11px", color: "#666", lineHeight: 1.4 }}>
								Full ledger recap: player spending, teams won, ante paid, net amounts
							</div>
						</div>
					)}
				</div>

				<div style={{ padding: "32px", flex: 1, display: "flex", flexDirection: "column", gap: "32px", overflowY: "auto" }}>
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
							{refreshCountdown !== null ? "Next Team In" : "Time Remaining"}
						</div>
						<div
							style={{
								fontSize: "64px",
								fontWeight: 700,
								color: refreshCountdown !== null 
									? "#4ade80" 
									: timeRemaining !== null && timeRemaining < 10 
										? "#ef4444" 
										: "#60a5fa",
								lineHeight: 1,
								fontVariantNumeric: "tabular-nums",
							}}
						>
							{refreshCountdown !== null ? `${refreshCountdown}s` : formatTime(timeRemaining)}
						</div>
					</div>

					{/* Up Next Preview - Only show after countdown finishes, hide when lot is open */}
					{showNextTeamPreview && nextPendingLot && currentLot?.status !== "open" && refreshCountdown === null && (
						<div
							style={{
								padding: "16px",
								backgroundColor: "#1a1a1a",
								borderRadius: "8px",
								border: "1px solid #333",
								borderLeft: "3px solid #4ade80",
							}}
						>
							<div style={{ fontSize: "11px", color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
								Up Next
							</div>
							<div style={{ fontSize: "18px", fontWeight: 600, color: "#fff", lineHeight: 1.2 }}>
								{nextPendingLot.team.seed
									? `${nextPendingLot.team.name} (${nextPendingLot.team.region} #${nextPendingLot.team.seed})`
									: nextPendingLot.team.name}
							</div>
							{nextPendingLot.team.bracket && (
								<div style={{ marginTop: "4px", fontSize: "12px", color: "#aaa" }}>
									{nextPendingLot.team.bracket}
								</div>
							)}
						</div>
					)}

					{/* Players List */}
					<div>
						<div style={{ fontSize: "12px", color: "#888", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
							Players ({state.players.length})
						</div>
						<div style={{ display: "flex", flexWrap: "wrap", gap: "8px", maxHeight: "140px", overflowY: "auto" }}>
							{state.players.map((player) => {
								const isHighBidder = player.id === currentLot?.highBidderId;
								const isSelected = selectedPlayerId === player.id;
								const minBid = currentLot?.status === "open" 
									? (currentLot.currentBidCents + (state.ruleSet?.minIncrementCents ?? 100))
									: 0;
								
								const canSelect = currentLot?.status === "open" || currentLot?.status === "pending";
								
								// Priority: Selected (green) > High Bidder (yellow) > Default
								// Only show one state at a time
								const showAsSelected = isSelected && !isHighBidder;
								const showAsHighBidder = isHighBidder && !isSelected;
								
								return (
									<button
										key={player.id}
										onClick={() => {
											if (canSelect) {
												// Toggle: if clicking the same player, deselect; otherwise select the new one
												if (selectedPlayerId === player.id) {
													setSelectedPlayerId(null);
													setBidAmount(0);
												} else {
													// Select this player (deselects any previous selection automatically)
													setSelectedPlayerId(player.id);
													if (currentLot?.status === "pending") {
														const minOpeningBid = state.ruleSet?.minIncrementCents ?? 100;
														setBidAmount(minOpeningBid);
														setBidInputValue((minOpeningBid / 100).toFixed(2));
													} else if (currentLot?.status === "open") {
														setBidAmount(minBid);
														setBidInputValue((minBid / 100).toFixed(2));
													}
												}
											}
										}}
										style={{
											padding: "10px 16px",
											backgroundColor: showAsSelected 
												? "#2a3a2a" 
												: showAsHighBidder 
													? "#2a2a1a" // Yellow tint background
													: "#2a2a2a",
											border: showAsSelected 
												? "2px solid #4ade80" // Green border for selected
												: showAsHighBidder 
													? "2px solid #fbbf24" // Yellow border for high bidder
													: "1px solid #444",
											borderRadius: "8px",
											fontSize: "14px",
											color: showAsSelected 
												? "#4ade80" // Green text for selected
												: showAsHighBidder 
													? "#fbbf24" // Yellow text for high bidder
													: "#e5e5e5",
											fontWeight: (showAsSelected || showAsHighBidder) ? 600 : 400,
											cursor: canSelect ? "pointer" : "default",
											transition: "all 0.2s",
											boxShadow: showAsSelected 
												? "0 2px 8px rgba(74, 222, 128, 0.2)" 
												: showAsHighBidder 
													? "0 2px 8px rgba(251, 191, 36, 0.2)" 
													: "none",
										}}
										onMouseOver={(e) => {
											if (canSelect && !showAsSelected) {
												if (showAsHighBidder) {
													e.currentTarget.style.backgroundColor = "#2a2a1a";
													e.currentTarget.style.borderColor = "#fbbf24";
												} else {
													e.currentTarget.style.backgroundColor = "#333";
													e.currentTarget.style.borderColor = "#555";
												}
												e.currentTarget.style.transform = "translateY(-1px)";
											}
										}}
										onMouseOut={(e) => {
											if (!showAsSelected) {
												if (showAsHighBidder) {
													e.currentTarget.style.backgroundColor = "#2a2a1a";
													e.currentTarget.style.borderColor = "#fbbf24";
												} else {
													e.currentTarget.style.backgroundColor = "#2a2a2a";
													e.currentTarget.style.borderColor = "#444";
												}
												e.currentTarget.style.transform = "translateY(0)";
											}
										}}
									>
										{player.name}
									</button>
								);
							})}
						</div>
					</div>

					{/* Team Import Section (if no teams) */}
					{showTeamImport && (
						<div style={{ marginTop: "24px", padding: "20px", backgroundColor: "#1a1a1a", borderRadius: "8px", border: "1px solid #333" }}>
							<div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px", color: "#fff" }}>
								Import Teams
							</div>
							<textarea
								id="team-import-textarea"
								rows={6}
								placeholder="Kansas City Chiefs (AFC #1)&#10;Buffalo Bills (AFC #2)&#10;..."
								style={{
									width: "100%",
									padding: "12px",
									backgroundColor: "#0a0a0a",
									color: "#e5e5e5",
									border: "1px solid #333",
									borderRadius: "6px",
									fontSize: "14px",
									fontFamily: "inherit",
									resize: "vertical",
								}}
							/>
							<button
								onClick={handleImportTeams}
								style={{
									marginTop: "12px",
									padding: "10px 20px",
									backgroundColor: "#4ade80",
									color: "#000",
									border: "none",
									borderRadius: "6px",
									fontSize: "14px",
									fontWeight: 600,
									cursor: "pointer",
									width: "100%",
								}}
							>
								Import & Randomize Teams
							</button>
						</div>
					)}

					{/* Quick Bid Section (when team is open) */}
					{currentLot && currentLot.status === "open" && (
						<div style={{ marginTop: "auto", padding: "24px", backgroundColor: "#1a1a1a", borderRadius: "12px", border: "1px solid #333" }}>
							<div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px", color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px" }}>
								Quick Bid
							</div>
							{/* Bid Amount Input */}
							<div style={{ marginBottom: "12px" }}>
								<input
									type="text"
									inputMode="decimal"
									value={bidInputValue}
									onChange={(e) => {
										const val = e.target.value;
										// Allow empty string, numbers, and one decimal point
										if (val === "" || /^\d*\.?\d*$/.test(val)) {
											setBidInputValue(val);
											// Update bidAmount in cents for validation
											const numVal = parseFloat(val) || 0;
											setBidAmount(Math.round(numVal * 100));
										}
									}}
									onBlur={() => {
										// Format the value on blur
										if (bidInputValue) {
											const numVal = parseFloat(bidInputValue);
											if (!isNaN(numVal) && numVal > 0) {
												setBidInputValue(numVal.toFixed(2));
											} else {
												setBidInputValue("");
											}
										}
									}}
									placeholder={`Min: $${((currentLot.currentBidCents + (state.ruleSet?.minIncrementCents ?? 100)) / 100).toFixed(2)}`}
									style={{
										width: "100%",
										padding: "10px",
										backgroundColor: "#0a0a0a",
										color: "#e5e5e5",
										border: "1px solid #333",
										borderRadius: "6px",
										fontSize: "16px",
										fontFamily: "inherit",
									}}
								/>
								<div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
									<button
										onClick={() => {
											const minBid = currentLot.currentBidCents + (state.ruleSet?.minIncrementCents ?? 100);
											setBidAmount(minBid);
											setBidInputValue((minBid / 100).toFixed(2));
										}}
										style={{
											flex: 1,
											padding: "8px",
											backgroundColor: "#2a2a2a",
											color: "#e5e5e5",
											border: "1px solid #444",
											borderRadius: "4px",
											fontSize: "12px",
											cursor: "pointer",
										}}
									>
										Min
									</button>
									<button
										onClick={() => {
											setBidAmount((b) => {
												const newAmount = b + 100;
												setBidInputValue((newAmount / 100).toFixed(2));
												return newAmount;
											});
										}}
										style={{
											flex: 1,
											padding: "8px",
											backgroundColor: "#2a2a2a",
											color: "#e5e5e5",
											border: "1px solid #444",
											borderRadius: "4px",
											fontSize: "12px",
											cursor: "pointer",
										}}
									>
										+$1
									</button>
									<button
										onClick={() => {
											setBidAmount((b) => {
												const newAmount = b + 500;
												setBidInputValue((newAmount / 100).toFixed(2));
												return newAmount;
											});
										}}
										style={{
											flex: 1,
											padding: "8px",
											backgroundColor: "#2a2a2a",
											color: "#e5e5e5",
											border: "1px solid #444",
											borderRadius: "4px",
											fontSize: "12px",
											cursor: "pointer",
										}}
									>
										+$5
									</button>
									<button
										onClick={() => {
											setBidAmount((b) => {
												const newAmount = b + 1000;
												setBidInputValue((newAmount / 100).toFixed(2));
												return newAmount;
											});
										}}
										style={{
											flex: 1,
											padding: "8px",
											backgroundColor: "#2a2a2a",
											color: "#e5e5e5",
											border: "1px solid #444",
											borderRadius: "4px",
											fontSize: "12px",
											cursor: "pointer",
										}}
									>
										+$10
									</button>
								</div>
							</div>
							{/* Player Buttons - for placing bids */}
							<div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", maxHeight: "200px", overflowY: "auto" }}>
								{state.players.map((player) => {
									const isSelected = selectedPlayerId === player.id;
									const minBid = currentLot.currentBidCents + (state.ruleSet?.minIncrementCents ?? 100);
									const canBid = bidAmount >= minBid;
									return (
										<button
											key={player.id}
											onClick={() => {
												if (isSubmittingBid) return;
												if (bidAmount >= minBid) {
													handleBid(player.id, bidAmount);
												} else {
													// If bid amount is too low, select player and set to minimum
													setSelectedPlayerId(player.id);
													setBidAmount(minBid);
													setBidInputValue((minBid / 100).toFixed(2));
												}
											}}
											disabled={isSubmittingBid}
											style={{
												padding: "12px",
												backgroundColor: isSelected ? "#2a3a2a" : "#2a2a2a",
												color: isSelected ? "#4ade80" : "#e5e5e5",
												border: isSelected ? "2px solid #4ade80" : "1px solid #444",
												borderRadius: "6px",
												fontSize: "14px",
												fontWeight: isSelected ? 600 : 500,
												cursor: isSubmittingBid ? "wait" : "pointer",
												opacity: isSubmittingBid ? 0.5 : (canBid ? 1 : 0.7),
												transition: "all 0.2s",
											}}
											onMouseOver={(e) => {
												if (!isSelected) {
													e.currentTarget.style.backgroundColor = "#333";
													e.currentTarget.style.borderColor = "#555";
												}
											}}
											onMouseOut={(e) => {
												if (!isSelected) {
													e.currentTarget.style.backgroundColor = "#2a2a2a";
													e.currentTarget.style.borderColor = "#444";
												}
											}}
										>
											{player.name}
										</button>
									);
								})}
							</div>
						</div>
					)}

					{/* Host Controls */}
					<div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
						{currentLot && (
							<>
								{currentLot.status !== "open" ? (
									<>
										{/* Opening Bid Input (when team is pending) */}
										<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
											<input
												type="text"
												inputMode="decimal"
												value={bidInputValue}
												onChange={(e) => {
													const val = e.target.value;
													// Allow empty string, numbers, and one decimal point
													if (val === "" || /^\d*\.?\d*$/.test(val)) {
														setBidInputValue(val);
														// Update bidAmount in cents for validation
														const numVal = parseFloat(val) || 0;
														setBidAmount(Math.round(numVal * 100));
													}
												}}
												onBlur={() => {
													// Format the value on blur
													if (bidInputValue) {
														const numVal = parseFloat(bidInputValue);
														if (!isNaN(numVal) && numVal > 0) {
															setBidInputValue(numVal.toFixed(2));
														} else {
															setBidInputValue("");
														}
													}
												}}
												placeholder={`Opening bid (min: $${((state.ruleSet?.minIncrementCents ?? 100) / 100).toFixed(2)})`}
												style={{
													width: "100%",
													padding: "10px",
													backgroundColor: "#0a0a0a",
													color: "#e5e5e5",
													border: "1px solid #333",
													borderRadius: "6px",
													fontSize: "14px",
													fontFamily: "inherit",
												}}
											/>
											<div style={{ display: "flex", gap: "6px" }}>
												<button
													onClick={() => {
														const minBid = state.ruleSet?.minIncrementCents ?? 100;
														setBidAmount(minBid);
														setBidInputValue((minBid / 100).toFixed(2));
													}}
													style={{
														flex: 1,
														padding: "6px",
														backgroundColor: "#2a2a2a",
														color: "#e5e5e5",
														border: "1px solid #444",
														borderRadius: "4px",
														fontSize: "11px",
														cursor: "pointer",
													}}
												>
													Min
												</button>
												<button
													onClick={() => {
														setBidAmount((b) => {
															const newAmount = b + 100;
															setBidInputValue((newAmount / 100).toFixed(2));
															return newAmount;
														});
													}}
													style={{
														flex: 1,
														padding: "6px",
														backgroundColor: "#2a2a2a",
														color: "#e5e5e5",
														border: "1px solid #444",
														borderRadius: "4px",
														fontSize: "11px",
														cursor: "pointer",
													}}
												>
													+$1
												</button>
												<button
													onClick={() => {
														setBidAmount((b) => {
															const newAmount = b + 500;
															setBidInputValue((newAmount / 100).toFixed(2));
															return newAmount;
														});
													}}
													style={{
														flex: 1,
														padding: "6px",
														backgroundColor: "#2a2a2a",
														color: "#e5e5e5",
														border: "1px solid #444",
														borderRadius: "4px",
														fontSize: "11px",
														cursor: "pointer",
													}}
												>
													+$5
												</button>
												<button
													onClick={() => {
														setBidAmount((b) => {
															const newAmount = b + 1000;
															setBidInputValue((newAmount / 100).toFixed(2));
															return newAmount;
														});
													}}
													style={{
														flex: 1,
														padding: "6px",
														backgroundColor: "#2a2a2a",
														color: "#e5e5e5",
														border: "1px solid #444",
														borderRadius: "4px",
														fontSize: "11px",
														cursor: "pointer",
													}}
												>
													+$10
												</button>
											</div>
										</div>
										<button
											onClick={async () => {
												if (!selectedPlayerId) {
													alert("Please select a player for the opening bid");
													return;
												}
												const minBid = state.ruleSet?.minIncrementCents ?? 100;
												if (bidAmount < minBid) {
													alert(`Opening bid must be at least $${(minBid / 100).toFixed(2)}`);
													return;
												}
												const res = await fetch(`/api/lots/${currentLot.id}/open`, {
													method: "POST",
													headers: { "content-type": "application/json" },
													body: JSON.stringify({
														playerId: selectedPlayerId,
														openingBidCents: bidAmount,
													}),
												});
												
												if (!res.ok) {
													const e = await res.json().catch(() => ({}));
													// If team is already open, refresh the page to sync state
													if (e.error?.includes("already open") || e.error?.includes("current status: open")) {
														alert("Team is already open. Refreshing page...");
														window.location.reload();
														return;
													}
													alert(e.error || "Request failed");
													return;
												}
												
												setShowTeamImport(false);
												setBidAmount(0);
												setBidInputValue("");
												setSelectedPlayerId(null);
											}}
											disabled={!selectedPlayerId || bidAmount < (state.ruleSet?.minIncrementCents ?? 100)}
											style={{
												padding: "14px 24px",
												backgroundColor: (selectedPlayerId && bidAmount >= (state.ruleSet?.minIncrementCents ?? 100)) ? "#4ade80" : "#666",
												color: "#000",
												border: "none",
												borderRadius: "8px",
												fontSize: "16px",
												fontWeight: 600,
												cursor: (selectedPlayerId && bidAmount >= (state.ruleSet?.minIncrementCents ?? 100)) ? "pointer" : "not-allowed",
												transition: "background-color 0.2s",
												opacity: (selectedPlayerId && bidAmount >= (state.ruleSet?.minIncrementCents ?? 100)) ? 1 : 0.6,
											}}
											onMouseOver={(e) => {
												if (selectedPlayerId && bidAmount >= (state.ruleSet?.minIncrementCents ?? 100)) {
													e.currentTarget.style.backgroundColor = "#22c55e";
												}
											}}
											onMouseOut={(e) => {
												if (selectedPlayerId && bidAmount >= (state.ruleSet?.minIncrementCents ?? 100)) {
													e.currentTarget.style.backgroundColor = "#4ade80";
												}
											}}
										>
											Start Bidding
										</button>
									</>
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
											onClick={async () => {
												if (!currentLot.highBidderId) {
													alert("No bid to accept");
													return;
												}
												const success = await post(`/api/lots/${currentLot.id}/accept`);
												if (!success) {
													alert("Failed to sell team. Please try again or refresh the page.");
												}
											}}
											disabled={!currentLot.highBidderId}
											style={{
												padding: "14px 24px",
												backgroundColor: currentLot.highBidderId ? "#4ade80" : "#666",
												color: "#000",
												border: "none",
												borderRadius: "8px",
												fontSize: "16px",
												fontWeight: 600,
												cursor: currentLot.highBidderId ? "pointer" : "not-allowed",
												transition: "background-color 0.2s",
												opacity: currentLot.highBidderId ? 1 : 0.6,
											}}
											onMouseOver={(e) => {
												if (currentLot.highBidderId) {
													e.currentTarget.style.backgroundColor = "#22c55e";
												}
											}}
											onMouseOut={(e) => {
												if (currentLot.highBidderId) {
													e.currentTarget.style.backgroundColor = "#4ade80";
												}
											}}
										>
											Sell Team & Advance
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
									Undo Last
								</button>
							</>
						)}
					</div>
				</div>
			</div>

			{/* Resizer */}
			<div
				onMouseDown={handleResizeStart}
				style={{
					width: "4px",
					cursor: "col-resize",
					backgroundColor: isResizing ? "#4ade80" : "#1f1f1f",
					flexShrink: 0,
					transition: "background-color 0.2s",
				}}
				onMouseEnter={(e) => {
					if (!isResizing) {
						e.currentTarget.style.backgroundColor = "#333";
					}
				}}
				onMouseLeave={(e) => {
					if (!isResizing) {
						e.currentTarget.style.backgroundColor = "#1f1f1f";
					}
				}}
			/>

			{/* Right Side - Activity Feed and Sold Teams */}
			<div style={{ flex: "1 1 0%", minWidth: "300px", display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: "#0f0f0f" }}>
				{/* Activity Feed Section */}
				<div style={{ flex: "1 1 0%", display: "flex", flexDirection: "column", overflow: "hidden", borderBottom: "1px solid #1f1f1f" }}>
					<div style={{ padding: "24px", borderBottom: "1px solid #1f1f1f", backgroundColor: "#111111" }}>
						<h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: "#f5f5f5" }}>Activity Feed</h2>
						<div style={{ marginTop: "4px", fontSize: "12px", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" }}>
							{state.recentBids.length} {state.recentBids.length === 1 ? "bid" : "bids"}
						</div>
					</div>
					<div
						style={{
							flex: 1,
							overflowY: "auto",
							padding: "24px",
							display: "flex",
							flexDirection: "column",
							gap: "16px",
						}}
					>
						{state.recentBids.length === 0 ? (
							<div style={{ 
								color: "#666", 
								fontSize: "16px", 
								textAlign: "center", 
								marginTop: "32px",
								padding: "24px",
								backgroundColor: "#1a1a1a",
								borderRadius: "12px",
								border: "1px dashed #2a2a2a"
							}}>
								<div style={{ fontSize: "48px", marginBottom: "16px", opacity: 0.3 }}>📊</div>
								<div>No bids yet</div>
								<div style={{ fontSize: "14px", color: "#555", marginTop: "8px" }}>
									Bids will appear here as they come in
								</div>
							</div>
						) : (
							state.recentBids.map((bid, index) => {
								const isCurrentLot = bid.lotId === currentLot?.id;
								// Most recent bid (index 0) - green
								// Second most recent (index 1) - red
								// All others (index 2+) - grey
								const isMostRecent = index === 0;
								const isSecondMostRecent = index === 1;
								const isHistorical = index >= 2;
								
								let backgroundColor = "#1a1a1a";
								let borderColor = "#2a2a2a";
								let borderWidth = "1px";
								let boxShadow = "none";
								let amountColor = "#4ade80";
								let playerNameColor = "#fff";
								let teamNameColor = "#888";
								let opacity = 1;
								
								if (isMostRecent) {
									backgroundColor = "#1a2e1a";
									borderColor = "#4ade80";
									borderWidth = "2px";
									boxShadow = "0 4px 12px rgba(74, 222, 128, 0.15)";
									amountColor = "#4ade80";
								} else if (isSecondMostRecent) {
									backgroundColor = "#2e1a1a";
									borderColor = "#ef4444";
									borderWidth = "2px";
									boxShadow = "0 4px 12px rgba(239, 68, 68, 0.15)";
									amountColor = "#ef4444";
								} else if (isHistorical) {
									backgroundColor = "#1a1a1a";
									borderColor = "#2a2a2a";
									borderWidth = "1px";
									opacity = 0.5;
									amountColor = "#666";
									playerNameColor = "#666";
									teamNameColor = "#555";
								}
								
								return (
									<div
										key={bid.id}
										style={{
											padding: "16px",
											backgroundColor,
											borderRadius: "12px",
											border: `${borderWidth} solid ${borderColor}`,
											transition: "all 0.2s",
											boxShadow,
											opacity,
										}}
									>
										<div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
											<div style={{ flex: 1 }}>
												<div style={{ fontSize: "16px", fontWeight: 600, color: playerNameColor, marginBottom: "4px" }}>
													{bid.playerName}
												</div>
												<div style={{ fontSize: "12px", color: teamNameColor }}>
													{bid.teamName}
												</div>
											</div>
											<div style={{ textAlign: "right", marginLeft: "12px" }}>
												<div style={{ fontSize: "20px", fontWeight: 700, color: amountColor, lineHeight: 1.2 }}>
													${(bid.amountCents / 100).toFixed(2)}
												</div>
												<div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
													{new Date(bid.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
												</div>
											</div>
										</div>
									</div>
								);
							})
						)}
					</div>
				</div>

				{/* Sold Teams / Owners Section */}
				<div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", overflow: "hidden", maxHeight: "40%", borderTop: "2px solid #1f1f1f" }}>
					<div style={{ padding: "24px", borderBottom: "1px solid #1f1f1f", backgroundColor: "#111111" }}>
						<h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: "#f5f5f5" }}>Owned Teams</h2>
						<div style={{ marginTop: "4px", fontSize: "12px", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" }}>
							{(state.soldLots ?? []).length} {(state.soldLots ?? []).length === 1 ? "team" : "teams"}
						</div>
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
						{(state.soldLots ?? []).length === 0 ? (
							<div style={{ 
								color: "#666", 
								fontSize: "14px", 
								textAlign: "center", 
								padding: "24px",
								backgroundColor: "#1a1a1a",
								borderRadius: "12px",
								border: "1px dashed #2a2a2a"
							}}>
								<div style={{ fontSize: "32px", marginBottom: "8px", opacity: 0.3 }}>🏆</div>
								<div>No teams sold yet</div>
							</div>
						) : (
							(state.soldLots ?? []).map((soldLot) => (
								<div
									key={soldLot.lotId}
									style={{
										padding: "14px",
										backgroundColor: "#1a1a1a",
										borderRadius: "10px",
										border: "1px solid #2a2a2a",
										transition: "all 0.2s",
									}}
								>
									<div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
										<div style={{ flex: 1 }}>
											<div style={{ fontSize: "14px", fontWeight: 600, color: "#4ade80", marginBottom: "4px" }}>
												{soldLot.teamName}
											</div>
											<div style={{ fontSize: "12px", color: "#aaa" }}>
												{soldLot.playerName}
											</div>
										</div>
										<div style={{ textAlign: "right", marginLeft: "12px" }}>
											<div style={{ fontSize: "16px", fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
												${(soldLot.amountCents / 100).toFixed(2)}
											</div>
										</div>
									</div>
								</div>
							))
						)}
					</div>
				</div>
			</div>
			</div>
		</div>
	);
}
