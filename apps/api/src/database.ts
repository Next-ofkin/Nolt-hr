import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { databaseConnectionString } from "./database-connection.js";
@Injectable()
export class Database extends PrismaClient implements OnModuleDestroy {
  constructor() {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
    super({
      // Hosted round trips must not inherit Prisma's short local-only defaults.
      // Services with longer bounded work (sessions/files) retain explicit overrides.
      transactionOptions: { maxWait: 10000, timeout: 15000 },
      adapter: new PrismaPg({
        connectionString: databaseConnectionString(process.env),
        options: "-c timezone=UTC",
        max: 8,
      }),
    });
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
