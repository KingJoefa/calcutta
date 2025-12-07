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
	
	// Redirect to presenter dashboard (unified host view)
	redirect(`/presenter/${eventId}`);
}
