import { redirect } from "next/navigation";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";

export default async function HostPage({
	params,
}: {
	params: Promise<{ eventId: string }>;
}) {
	const { eventId } = await params;
	const event = await prisma.event.findUnique({
		where: { id: eventId },
	});
	
	if (!event) {
		return <div>Event not found</div>;
	}
	
	// Canonical host link: use the dropdown/timer view in host mode.
	// (Invite-link bidders won't have host=1, so they remain blocked at timer=0.)
	redirect(`/audience/${eventId}?host=1`);
}
