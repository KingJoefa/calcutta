import { PrismaClient } from "../generated/prisma";

declare global {
	// eslint-disable-next-line no-var
	var prismaGlobal: PrismaClient | undefined;
}

function normalizeDatabaseUrl(raw?: string): string | undefined {
	if (!raw) return raw;
	// Prisma + Supabase Pooler (PgBouncer) can throw:
	//   prepared statement "s0" already exists
	// Fix: disable prepared statements / statement cache for PgBouncer.
	// Prisma recognizes `pgbouncer=true` and `statement_cache_size=0` in the connection string.
	try {
		const url = new URL(raw);
		const host = url.host.toLowerCase();
		const isSupabasePooler = host.includes("pooler.supabase.com");
		if (isSupabasePooler) {
			if (!url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
			if (!url.searchParams.has("statement_cache_size")) url.searchParams.set("statement_cache_size", "0");
			// Keep connection count low for serverless + pooler to avoid exhaustion.
			if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
			return url.toString();
		}
		return raw;
	} catch {
		// If parsing fails, leave as-is.
		return raw;
	}
}

export const prisma: PrismaClient =
	global.prismaGlobal ??
	new PrismaClient({
		log: ["error", "warn"],
		datasources: {
			db: {
				url: normalizeDatabaseUrl(process.env.DATABASE_URL),
			},
		},
	});

if (process.env.NODE_ENV !== "production") {
	global.prismaGlobal = prisma;
}


