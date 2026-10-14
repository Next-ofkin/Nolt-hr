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
  const app = await NestFactory.create<
    import("@nestjs/platform-express").NestExpressApplication
  >(AppModule, {
    logger: ["error", "warn", "log"],
    bodyParser: false,
  });
  app.useBodyParser("json", { limit: "15mb" });
  app.setGlobalPrefix("api/v1");
  app.use(
    (
      req: import("express").Request,
      res: import("express").Response,
      next: () => void,
    ) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Content-Type-Options", "nosniff");
      next();
    },
  );
  app.enableShutdownHooks();
  const options = new DocumentBuilder()
    .setTitle("NOLT HR API")
    .setDescription(
      "HR form authoring with real Supabase Auth, browser-bound email verification/recovery and mandatory authenticator MFA.",
    )
    .setVersion("0.1.0")
    .addCookieAuth("nolt_session", { type: "apiKey", in: "cookie" }, "session")
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup("api/docs", app, document);
  return { app, document };
}
