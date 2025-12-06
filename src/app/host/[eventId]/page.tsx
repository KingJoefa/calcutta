import { prisma } from "../../../lib/prisma";
import { HostControls } from "../../../components/HostControls";
import { ImportAndRandomize } from "../../../components/ImportAndRandomize";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HostPage({
	params,
}: {
	params: Promise<{ eventId: string }>;
}) {
	const { eventId } = await params;
	const event = await prisma.event.findUnique({
		where: { id: eventId },
		include: {
			players: true,
			lots: { include: { team: true }, orderBy: { orderIndex: "asc" } },
			teams: true,
			ruleSet: true,
		},
	});
	if (!event) {
		return <div>Event not found</div>;
	}
	const hasLots = event.lots.length > 0;
	return (
		<div style={{ padding: 24 }}>
			<h1>Host Console – {event.name}</h1>
			<div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
				<Link href={`/presenter/${event.id}`}>Presenter View</Link>
				<Link href={`/audience/${event.id}`}>Audience View</Link>
			</div>
			<div style={{ marginBottom: 16, padding: 12, background: "#f5f5f5", borderRadius: 4 }}>
				<h3 style={{ marginTop: 0 }}>Players ({event.players.length})</h3>
				<ul style={{ margin: 0, paddingLeft: 20 }}>
					{event.players.map((p) => (
						<li key={p.id}>
							{p.name} {p.handle && <span style={{ color: "#666" }}>{p.handle}</span>}
						</li>
					))}
				</ul>
			</div>
			{!hasLots ? (
				<ImportAndRandomize eventId={event.id} />
			) : (
				<HostControls
					eventId={event.id}
					players={event.players}
					lots={event.lots as any}
				/>
			)}
		</div>
	);
}

