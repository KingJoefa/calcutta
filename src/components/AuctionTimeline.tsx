"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type Step = "home" | "auction" | "results";

export function AuctionTimeline({ currentStep, eventId }: { currentStep: Step; eventId?: string }) {
	const router = useRouter();
	const steps: { key: Step; label: string; path?: string }[] = [
		{ key: "auction", label: "Auction", path: eventId ? `/presenter/${eventId}` : undefined },
		{ key: "results", label: "Results", path: eventId ? `/host/${eventId}` : undefined },
	];

	const currentIndex = steps.findIndex((s) => s.key === currentStep);
	const isHome = currentStep === "home";

	// Use dark theme for auction (presenter)
	const isDark = currentStep === "auction";

	const handleHomeClick = (e: React.MouseEvent) => {
		// Only warn if we're on auction or results step
		if (currentStep === "auction" || currentStep === "results") {
			e.preventDefault();
			const confirmed = window.confirm(
				"Are you sure you want to leave? You will lose your current progress."
			);
			if (confirmed) {
				router.push("/");
			}
		}
		// If on setup step or home, let the Link handle navigation normally
	};
	
	return (
		<nav
			style={{
				display: "flex",
				alignItems: "center",
				gap: "8px",
				padding: "16px 24px",
				backgroundColor: isDark ? "#111111" : "#f9fafb",
				borderBottom: isDark ? "1px solid #1f1f1f" : "1px solid #e5e7eb",
				fontSize: "14px",
			}}
		>
			{isHome ? (
				<span
					style={{
						color: "#2563eb",
						textDecoration: "none",
						fontWeight: 600,
						padding: "4px 8px",
						borderRadius: "4px",
						backgroundColor: "#eff6ff",
					}}
				>
					Home
				</span>
			) : (
				<a
					href="/"
					onClick={handleHomeClick}
					style={{
						color: isDark ? "#9ca3af" : "#6b7280",
						textDecoration: "none",
						fontWeight: 500,
						transition: "color 0.2s",
						cursor: "pointer",
					}}
					onMouseOver={(e) => (e.currentTarget.style.color = "#60a5fa")}
					onMouseOut={(e) => (e.currentTarget.style.color = isDark ? "#9ca3af" : "#6b7280")}
				>
					Home
				</a>
			)}
			<span style={{ color: isDark ? "#374151" : "#d1d5db", margin: "0 4px" }}>•</span>
			{steps.map((step, index) => {
				const isActive = index === currentIndex;
				const isCompleted = index < currentIndex;
				const isClickable = step.path && (isCompleted || isActive);

				return (
					<div key={step.key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
						{step.path && isClickable ? (
							<Link
								href={step.path}
								style={{
									color: isActive 
										? (isDark ? "#60a5fa" : "#2563eb") 
										: isCompleted 
											? (isDark ? "#4ade80" : "#059669") 
											: (isDark ? "#6b7280" : "#9ca3af"),
									textDecoration: "none",
									fontWeight: isActive ? 600 : 500,
									padding: "4px 8px",
									borderRadius: "4px",
									backgroundColor: isActive 
										? (isDark ? "#1e3a5f" : "#eff6ff") 
										: "transparent",
									transition: "all 0.2s",
								}}
								onMouseOver={(e) => {
									if (!isActive) {
										e.currentTarget.style.color = isDark ? "#60a5fa" : "#2563eb";
										e.currentTarget.style.backgroundColor = isDark ? "#1e293b" : "#f0f9ff";
									}
								}}
								onMouseOut={(e) => {
									if (!isActive) {
										e.currentTarget.style.color = isCompleted 
											? (isDark ? "#4ade80" : "#059669") 
											: (isDark ? "#6b7280" : "#9ca3af");
										e.currentTarget.style.backgroundColor = "transparent";
									}
								}}
							>
								{step.label}
							</Link>
						) : (
							<span
								style={{
									color: isActive 
										? (isDark ? "#60a5fa" : "#2563eb") 
										: (isDark ? "#6b7280" : "#9ca3af"),
									fontWeight: isActive ? 600 : 500,
									padding: "4px 8px",
								}}
							>
								{step.label}
							</span>
						)}
						{index < steps.length - 1 && (
							<span
								style={{
									color: isDark ? "#374151" : "#d1d5db",
									margin: "0 4px",
									fontSize: "12px",
								}}
							>
								›
							</span>
						)}
					</div>
				);
			})}
		</nav>
	);
}

