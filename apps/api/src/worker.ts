import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.js";
import { InvitationsService } from "./invitations.js";
const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ["error", "warn"],
});
const service = app.get(InvitationsService);
let running = true;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    running = false;
  });
console.log("Invitation delivery worker started.");
while (running) {
  try {
    if (await service.deliverNext()) continue;
  } catch {
    console.error("Invitation queue check failed; retrying shortly.");
  }
  await new Promise((r) => setTimeout(r, 5000));
}
await app.close();
