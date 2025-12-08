"use client";

import { useMemo } from "react";
import type { ResultsSummary, OwnerBreakdown, TopSale } from "../lib/results";
import { AuctionTimeline } from "./AuctionTimeline";

type ResultsDashboardProps = {
	eventId: string;
	eventName: string;
	summary: ResultsSummary;
	owners: OwnerBreakdown[];
	topSales: TopSale[];
	roundAllocations: Record<string, number>;
	allTeams: Array<{ teamName: string; ownerName: string | null; priceCents: number | null }>;
};

export function ResultsDashboard(props: ResultsDashboardProps) {
	const {
		eventId,
		eventName,
		summary,
		owners,
		topSales,
		roundAllocations,
		allTeams,
	} = props;

	const allocationEntries = useMemo(
		() => Object.entries(roundAllocations ?? {}),
		[roundAllocations],
	);

	const currency = (cents: number | null | undefined) =>
		cents === null || cents === undefined ? "—" : `$${(cents / 100).toFixed(2)}`;

	return (
		<div
			style={{
				minHeight: "100vh",
				background: "#0a0a0f",
				color: "#e5e7eb",
				fontFamily: "system-ui, -apple-system, sans-serif",
			}}
		>
			<AuctionTimeline currentStep="results" eventId={eventId} />
			<div style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
				<header style={{ marginBottom: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
						<h1 style={{ margin: 0, fontSize: "32px", fontWeight: 700, color: "#f8fafc" }}>{eventName}</h1>
						<a
							href={`/api/events/${eventId}/recap`}
							style={{
								padding: "10px 16px",
								background: "linear-gradient(135deg, #22c55e, #14b8a6)",
								color: "#041308",
								borderRadius: "10px",
								fontWeight: 700,
								textDecoration: "none",
								boxShadow: "0 12px 30px rgba(34, 197, 94, 0.25)",
							}}
						>
							Download Recap CSV
						</a>
					</div>
					<div style={{ color: summary.allSold ? "#22c55e" : "#fbbf24", fontWeight: 600 }}>
						{summary.allSold ? "All teams sold — final results" : "Auction in progress — partial results"}
					</div>
				</header>

				{/* Hero stats */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
						gap: "16px",
						marginBottom: "24px",
					}}
				>
					<StatCard label="Total Pot" value={currency(summary.potCents)} accent="#22c55e" />
					<StatCard label="Teams Sold" value={`${summary.soldCount}/${summary.totalTeams}`} accent="#60a5fa" />
					<StatCard label="Average Price" value={currency(summary.avgSaleCents)} accent="#f59e0b" />
					<StatCard label="High / Low" value={`${currency(summary.maxSaleCents)} / ${currency(summary.minSaleCents)}`} accent="#a855f7" />
				</div>

				<div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px", marginBottom: "16px" }}>
					{/* Owners leaderboard */}
					<Panel title="Owners Leaderboard" subtitle="Total spend and teams owned">
						<div style={{ display: "grid", gap: "8px" }}>
							{owners.length === 0 && <EmptyState text="No sales yet" />}
							{owners.map((owner) => (
								<div
									key={owner.playerId}
									style={{
										display: "grid",
										gridTemplateColumns: "1.5fr 1fr 1fr",
										alignItems: "center",
										padding: "12px",
										borderRadius: "12px",
										background: "rgba(255,255,255,0.03)",
										border: "1px solid rgba(255,255,255,0.06)",
									}}
								>
									<div style={{ fontWeight: 700 }}>
										{owner.name}{" "}
										{owner.handle && <span style={{ color: "#9ca3af", fontWeight: 500 }}>{owner.handle}</span>}
									</div>
									<div style={{ color: "#9ca3af" }}>{owner.teamCount} {owner.teamCount === 1 ? "team" : "teams"}</div>
									<div style={{ textAlign: "right", fontWeight: 700 }}>{currency(owner.totalSpendCents)}</div>
								</div>
							))}
						</div>
					</Panel>

					{/* Payout allocation */}
					<Panel title="Payout Allocation" subtitle="Round percentages">
						{allocationEntries.length === 0 && <EmptyState text="No payout configuration" />}
						<div style={{ display: "grid", gap: "12px" }}>
							{allocationEntries.map(([round, pct]) => (
								<div key={round} style={{ display: "grid", gap: "6px" }}>
									<div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
										<span style={{ textTransform: "capitalize" }}>{round}</span>
										<span>{(pct * 100).toFixed(1)}%</span>
									</div>
									<div style={{ height: "10px", borderRadius: "999px", background: "#1f2937" }}>
										<div
											style={{
												width: `${Math.min(100, Math.max(0, pct * 100))}%`,
												height: "10px",
												borderRadius: "999px",
												background: "linear-gradient(135deg, #3b82f6, #22c55e)",
											}}
										/>
									</div>
								</div>
							))}
						</div>
					</Panel>
				</div>

				<div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "16px", marginBottom: "16px" }}>
					{/* Who bought what */}
					<Panel title="Who Bought What" subtitle="All teams and their owners">
						<div style={{ display: "grid", gap: "8px" }}>
							{allTeams.length === 0 && <EmptyState text="No teams found" />}
							{allTeams.map((t, idx) => (
								<div
									key={`${t.teamName}-${idx}`}
									style={{
										display: "grid",
										gridTemplateColumns: "2fr 1fr 1fr",
										alignItems: "center",
										padding: "10px",
										borderRadius: "10px",
										background: "rgba(255,255,255,0.02)",
										border: "1px solid rgba(255,255,255,0.05)",
									}}
								>
									<div style={{ fontWeight: 700, color: "#f8fafc" }}>{t.teamName}</div>
									<div style={{ color: t.ownerName ? "#9ca3af" : "#f87171" }}>{t.ownerName ?? "Unsold"}</div>
									<div style={{ textAlign: "right", fontWeight: 700 }}>{t.priceCents ? currency(t.priceCents) : "—"}</div>
								</div>
							))}
						</div>
					</Panel>

					{/* Top sales */}
					<Panel title="Top Sales" subtitle="Highest prices of the auction">
						{topSales.length === 0 && <EmptyState text="No sales yet" />}
						<div style={{ display: "grid", gap: "12px" }}>
							{topSales.map((sale, i) => (
								<div
									key={`${sale.teamName}-${i}`}
									style={{
										padding: "12px",
										borderRadius: "12px",
										background: "linear-gradient(135deg, rgba(59,130,246,0.1), rgba(34,197,94,0.1))",
										border: "1px solid rgba(255,255,255,0.06)",
									}}
								>
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
										<div style={{ fontWeight: 700 }}>{sale.teamName}</div>
										<div style={{ fontWeight: 700 }}>{currency(sale.amountCents)}</div>
									</div>
									<div style={{ color: "#9ca3af", fontSize: "13px" }}>
										{sale.playerName} • {new Date(sale.finalizedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
									</div>
								</div>
							))}
						</div>
					</Panel>
				</div>
			</div>
		</div>
	);
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
	return (
		<div
			style={{
				padding: "16px",
				borderRadius: "14px",
				background: "linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
				border: "1px solid rgba(255,255,255,0.08)",
				boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
			}}
		>
			<div style={{ fontSize: "13px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</div>
			<div style={{ marginTop: "8px", fontSize: "28px", fontWeight: 800, color: accent }}>{value}</div>
		</div>
	);
}

function Panel({
	title,
	subtitle,
	children,
}: {
	title: string;
	subtitle?: string;
	children: React.ReactNode;
}) {
	return (
		<div
			style={{
				padding: "16px",
				borderRadius: "14px",
				background: "rgba(255,255,255,0.03)",
				border: "1px solid rgba(255,255,255,0.06)",
				boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
			}}
		>
			<div style={{ marginBottom: "10px" }}>
				<div style={{ fontSize: "16px", fontWeight: 700 }}>{title}</div>
				{subtitle && <div style={{ color: "#9ca3af", fontSize: "13px" }}>{subtitle}</div>}
			</div>
			{children}
		</div>
	);
}

function EmptyState({ text }: { text: string }) {
	return (
		<div
			style={{
				padding: "16px",
				borderRadius: "12px",
				border: "1px dashed rgba(255,255,255,0.12)",
				color: "#9ca3af",
				textAlign: "center",
			}}
		>
			{text}
		</div>
	);
}
