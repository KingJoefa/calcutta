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
			});
		});
		return () => {
			wsRef.current?.close();
		};
	}, [eventId]);

	if (!currentLot) {
		return <div>No lots found. Import teams and randomize order.</div>;
	}

	const highBidder =
		props.players.find((p) => p.id === currentLot.highBidderId)?.name ?? "-";

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

	const teamDisplay = currentLot.team.seed
		? `${currentLot.team.name} (${currentLot.team.region} #${currentLot.team.seed})`
		: currentLot.team.name;

	return (
		<div style={{ display: "grid", gap: 12 }}>
			<h2>
				Current: {teamDisplay} ({currentLot.status})
			</h2>
			<div>High bid: {(currentLot.currentBidCents / 100).toFixed(2)}</div>
			<div>High bidder: {highBidder}</div>
			<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
				<select
					value={selectedPlayerId}
					onChange={(e) => setSelectedPlayerId(e.target.value)}
				>
					{props.players.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
						</option>
					))}
				</select>
				<input
					type="number"
					value={bidAmount}
					onChange={(e) => setBidAmount(Number(e.target.value))}
					placeholder="amount (cents)"
				/>
				<button onClick={() => setBidAmount((b) => b + 100)}>+1</button>
				<button onClick={() => setBidAmount((b) => b + 500)}>+5</button>
				<button onClick={() => setBidAmount((b) => b + 1000)}>+10</button>
				<button
					onClick={() =>
						post(`/api/lots/${currentLot.id}/bid`, {
							playerId: selectedPlayerId,
							amountCents: bidAmount,
						})
					}
					disabled={!selectedPlayerId}
				>
					Bid
				</button>
			</div>
			<div style={{ display: "flex", gap: 8 }}>
				{currentLot.status !== "open" ? (
					<button onClick={() => post(`/api/lots/${currentLot.id}/open`)}>
						Open Lot
					</button>
				) : (
					<button onClick={() => post(`/api/lots/${currentLot.id}/sell`)}>Sold</button>
				)}
				<button onClick={() => post(`/api/events/${eventId}/undo`)}>Undo last</button>
			</div>
		</div>
	);
}


