import { createApp } from "./bootstrap.js";
const { app } = await createApp();
if (process.env.NODE_ENV === "production")
  throw new Error(
    "Production startup is disabled until managed identity and release controls are implemented.",
  );
await app.listen(Number(process.env.API_PORT ?? 4000), "127.0.0.1");
console.log("NOLT API: http://127.0.0.1:4000/api/docs");
