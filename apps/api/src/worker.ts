import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.js";
import { InvitationsService } from "./invitations.js";
import { ExternalRequestsService } from "./external-requests.js";
const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ["error", "warn"],
});
const service = app.get(InvitationsService);
const external = app.get(ExternalRequestsService);
let running = true;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    running = false;
  });
console.log("Invitation delivery worker started.");
while (running) {
  try {
    const delivered = await service.deliverNext();
    const externalDelivered = await external.deliverNext();
    if (delivered || externalDelivered) continue;
  } catch {
    console.error("Invitation queue check failed; retrying shortly.");
  }
  await new Promise((r) => setTimeout(r, 5000));
}
await app.close();
