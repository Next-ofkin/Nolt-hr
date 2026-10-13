const urls = [
  "http://127.0.0.1:4000/api/v1/health/ready",
  "http://127.0.0.1:3000",
];
for (const url of urls) {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error(`Service not ready: ${url}`);
}
console.log("Local API/database and web are ready.");
