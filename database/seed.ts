import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
config({ quiet: true });
if (
  process.env.LOCAL_DEVELOPMENT !== "true" ||
  process.env.NODE_ENV === "production"
)
  throw new Error(
    "Synthetic seed is restricted to explicit local development.",
  );
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_DATABASE_URL }),
});
for (const [role, email, name] of [
  ["HR", "hr@example.test", "Local HR"],
  ["EMPLOYEE", "employee@example.test", "Local Employee"],
]) {
  await db.user.upsert({
    where: { email },
    create: { email, name, role },
    update: {},
  });
}
console.log(
  "Synthetic HR and employee users ready. No real employee data imported.",
);
await db.$disconnect();
