import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { config } from "dotenv";
import { resolve } from "node:path";
import { AppModule } from "./app.js";
export async function createApp() {
  config({
    path: resolve(import.meta.dirname, "../../..", ".env"),
    quiet: true,
  });
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });
  app.setGlobalPrefix("api/v1");
  app.enableShutdownHooks();
  const options = new DocumentBuilder()
    .setTitle("NOLT HR API")
    .setDescription(
      "Initial HR form authoring slice. Local identity is development-only.",
    )
    .setVersion("0.1.0")
    .addCookieAuth("nolt_session", { type: "apiKey", in: "cookie" }, "session")
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup("api/docs", app, document);
  return { app, document };
}
