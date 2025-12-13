import { PrismaClient } from "../generated/prisma";

declare global {
	// eslint-disable-next-line no-var
	var prismaGlobal: PrismaClient | undefined;
}

export const prisma: PrismaClient =
	global.prismaGlobal ??
	new PrismaClient({
		log: ["error", "warn"],
		datasources: {
			db: {
				url: process.env.DATABASE_URL,
			},
		},
	});

if (process.env.NODE_ENV !== "production") {
	global.prismaGlobal = prisma;
}


