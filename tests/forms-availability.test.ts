import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { FormsService } from "../apps/api/dist/forms.js";
test("temporary publishing storage failures return a safe retryable response without database details", async () => {
  for (const code of ["P2028", "P1017"]) {
    const service = new FormsService({
      $transaction: async () => {
        throw new Prisma.PrismaClientKnownRequestError(
          "private database request details",
          { code, clientVersion: "test" },
        );
      },
    } as never);
    await assert.rejects(
      service.publish("actor", "form", { expectedRevision: 1 }),
      (e: any) =>
        e.getStatus() === 503 &&
        !e.message.includes("private database request details"),
    );
  }
});
