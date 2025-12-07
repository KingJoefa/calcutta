/* eslint-disable react-hooks/exhaustive-deps */
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { connectWs, type Message } from "../client/wsClient";

type Player = { id: string; name: string; handle?: string | null };
type Lot = {
	id: string;
	status: "pending" | "open" | "sold";
	currentBidCents: number;
	highBidderId: string | null;
	closesAt: string | null;
	team: { id: string; name: string; seed?: number | null; region?: string | null };
};

export function HostControls(props: {
	eventId: string;
	players: Player[];
	lots: Lot[];
}) {
	const { eventId } = props;
	const [lots, setLots] = useState(props.lots);
	const [selectedPlayerId, setSelectedPlayerId] = useState(
		props.players[0]?.id ?? "",
	);
	const [bidAmount, setBidAmount] = useState(0);
	const wsRef = useRef<WebSocket | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const currentLot = useMemo(
		() => lots.find((l) => l.status === "open") ?? lots.find((l) => l.status === "pending"),
		[lots],
	);

	useEffect(() => {
		// Ensure WS server is started (useful when coming directly to Host with a seeded event)
		fetch("/api/ws").finally(() => {
			wsRef.current = connectWs(eventId, (msg: Message) => {
				if (msg.type === "bid_placed") {
					setLots((prev) =>
						prev.map((l) =>
							l.id === (msg.payload as any).lotId
								? {
										...l,
										currentBidCents: (msg.payload as any).amountCents,
										highBidderId: (msg.payload as any).playerId || (msg.payload as any).entrantId,
									}
								: l,
						),
					);
				}
				if (msg.type === "lot_sold") {
					setLots((prev) =>
						prev.map((l) =>
							l.id === (msg.payload as any).lotId ? { ...l, status: "sold" } : l,
						),
					);
				}
				if (msg.type === "lot_opened") {
					setLots((prev) =>
						prev.map((l) =>
							l.id === (msg.payload as any).lotId ? { ...l, status: "open" } : l,
						),
					);
				}
				if (msg.type === "bid_accepted") {
					const payload = msg.payload as any;
					setLots((prev) =>
						prev.map((l) =>
							l.id === payload.lotId
								? { ...l, acceptedBidderId: payload.playerId }
								: l,
						),
					);
				}
			});
		});
		return () => {
			wsRef.current?.close();
		};
	}, [eventId]);

	if (!currentLot) {
		return <div>No teams found. Import teams and randomize order.</div>;
	}

	const highBidder =
		props.players.find((p) => p.id === currentLot.highBidderId)?.name ?? "-";

	const post = async (url: string, body?: any) => {
		setIsSubmitting(true);
		const res = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: body ? JSON.stringify(body) : undefined,
		});
		setIsSubmitting(false);
		if (!res.ok) {
			const e = await res.json().catch(() => ({}));
			alert(e.error || "Request failed");
			return false;
		}
		return true;
	};

	const teamDisplay = currentLot.team.seed
		? `${currentLot.team.name} (${currentLot.team.region} #${currentLot.team.seed})`
		: currentLot.team.name;

	const minBid = currentLot.currentBidCents + 100;
	const button = {
		base: {
			border: "1px solid transparent",
			borderRadius: 8,
			padding: "10px 14px",
			fontWeight: 600,
			cursor: "pointer",
			transition: "transform 120ms ease, box-shadow 120ms ease, background 120ms ease",
		} as const,
		primary: {
			background: "linear-gradient(135deg, #2dd4bf, #0ea5e9)",
			color: "#04131b",
			boxShadow: "0 10px 24px rgba(14,165,233,0.25)",
		},
		secondary: {
			background: "rgba(255,255,255,0.08)",
			color: "#f8fafc",
			borderColor: "rgba(255,255,255,0.12)",
		},
		danger: {
			background: "#ef4444",
			color: "#fff",
		},
	};

	return (
		<div
			style={{
				display: "grid",
				gap: 12,
				background: "#0f172a",
				color: "#e2e8f0",
				padding: 16,
				borderRadius: 12,
				border: "1px solid rgba(255,255,255,0.06)",
			}}
		>
			<h2 style={{ margin: 0, fontSize: 18 }}>
				Current: {teamDisplay}{" "}
				<span style={{ color: "#94a3b8" }}>({currentLot.status})</span>
			</h2>
			<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
				<div>High bid: ${(currentLot.currentBidCents / 100).toFixed(2)}</div>
				<div>High bidder: {highBidder}</div>
			</div>

			<div
				style={{
					display: "grid",
					gap: 8,
					background: "rgba(255,255,255,0.03)",
					border: "1px solid rgba(255,255,255,0.06)",
					borderRadius: 10,
					padding: 12,
				}}
			>
				<label
					style={{ fontSize: 12, textTransform: "uppercase", color: "#94a3b8" }}
					htmlFor="host-player-select"
				>
					Bidder
				</label>
				<select
					value={selectedPlayerId}
					onChange={(e) => setSelectedPlayerId(e.target.value)}
					id="host-player-select"
					style={{
						padding: 10,
						borderRadius: 8,
						border: "1px solid rgba(255,255,255,0.12)",
						background: "#0b1221",
						color: "#e2e8f0",
					}}
				>
					{props.players.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
						</option>
					))}
				</select>

				<label
					style={{ fontSize: 12, textTransform: "uppercase", color: "#94a3b8" }}
					htmlFor="host-bid-input"
				>
					Bid amount (cents)
				</label>
				<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
					<input
						id="host-bid-input"
						type="number"
						value={bidAmount}
						onChange={(e) => setBidAmount(Number(e.target.value))}
						placeholder={`Min: ${minBid}`}
						min={minBid}
						step={100}
						style={{
							flex: 1,
							minWidth: 160,
							padding: 10,
							borderRadius: 8,
							border: "1px solid rgba(255,255,255,0.12)",
							background: "#0b1221",
							color: "#e2e8f0",
						}}
						aria-label="Bid amount in cents"
					/>
					<div style={{ display: "flex", gap: 6 }}>
						<button
							type="button"
							onClick={() => setBidAmount((b) => b + 100)}
							style={{ ...button.base, ...button.secondary }}
							aria-label="Add one dollar"
						>
							+$1
						</button>
						<button
							type="button"
							onClick={() => setBidAmount((b) => b + 500)}
							style={{ ...button.base, ...button.secondary }}
							aria-label="Add five dollars"
						>
							+$5
						</button>
						<button
							type="button"
							onClick={() => setBidAmount((b) => b + 1000)}
							style={{ ...button.base, ...button.secondary }}
							aria-label="Add ten dollars"
						>
							+$10
						</button>
					</div>
				</div>
				<div>
					<button
						onClick={() =>
							post(`/api/lots/${currentLot.id}/bid`, {
								playerId: selectedPlayerId,
								amountCents: bidAmount,
							})
						}
						disabled={!selectedPlayerId || isSubmitting}
						style={{
							...button.base,
							...button.primary,
							width: "100%",
							opacity: isSubmitting ? 0.7 : 1,
							cursor: !selectedPlayerId ? "not-allowed" : "pointer",
						}}
						aria-label="Submit bid"
					>
						{isSubmitting ? "Submitting..." : "Place Bid"}
					</button>
				</div>
			</div>

			<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
				{currentLot.status !== "open" ? (
					<button
						onClick={() => post(`/api/lots/${currentLot.id}/open`)}
						style={{ ...button.base, ...button.primary }}
						disabled={isSubmitting}
						aria-label="Start bidding"
					>
						Start Bidding
					</button>
				) : (
					<>
						<button
							onClick={() => {
								if (!currentLot.highBidderId) {
									alert("No bid to accept");
									return;
								}
								post(`/api/lots/${currentLot.id}/accept`);
							}}
							style={{
								...button.base,
								...button.primary,
								opacity: currentLot.highBidderId ? 1 : 0.6,
								cursor: currentLot.highBidderId ? "pointer" : "not-allowed",
							}}
							disabled={!currentLot.highBidderId || isSubmitting}
							aria-label="Sell team to high bidder and advance to next team"
						>
							Sell Team & Advance
						</button>
					</>
				)}
				<button
					onClick={() => post(`/api/events/${eventId}/undo`)}
					style={{ ...button.base, ...button.secondary }}
					aria-label="Undo last sale"
					disabled={isSubmitting}
				>
					Undo Last
				</button>
			</div>
		</div>
	);
}

