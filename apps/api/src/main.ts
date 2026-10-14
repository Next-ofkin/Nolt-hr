import { runtimeSettings } from "./runtime.js";
import { createApp } from "./bootstrap.js";
const { app } = await createApp();
const { port, host } = runtimeSettings(process.env);
const maxRetries = 15;
for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    await app.listen(port, host);
    break;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "EADDRINUSE" && attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      continue;
    }
    throw err;
  }
}
console.log(`NOLT API: http://${host}:${port}/api/docs`);
