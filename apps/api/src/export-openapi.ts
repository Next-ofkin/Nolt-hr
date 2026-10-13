import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApp } from "./bootstrap.js";
const { app, document } = await createApp();
const directory = resolve("docs/api");
await mkdir(directory, { recursive: true });
await writeFile(
  resolve(directory, "openapi.json"),
  JSON.stringify(document, null, 2) + "\n",
);
await app.close();
