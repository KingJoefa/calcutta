"use client";

export function ImportAndRandomize({ eventId }: { eventId: string }) {
	return (
		<div style={{ display: "grid", gap: 8 }}>
			<h3>Import 14 NFL Teams (one per line)</h3>
			<textarea id="teams" rows={8} placeholder="Team A&#10;Team B" />
			<button
				onClick={async () => {
					const text = (document.getElementById("teams") as HTMLTextAreaElement)
						.value;
					const teams = text
						.split("\n")
						.map((s) => s.trim())
						.filter(Boolean)
						.map((name) => ({ name }));
					await fetch(`/api/events/${eventId}/import-teams`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ teams }),
					}).then((r) => r.json());
					// Randomization happens automatically in import-teams
					location.reload();
				}}
			>
				Import NFL Teams
			</button>
		</div>
	);
}

