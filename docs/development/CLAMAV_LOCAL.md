# Local ClamAV setup

The owner authorised a free local scanner on 14 October 2026. Official ClamAV 1.4.6 LTS x64 portable binaries are installed under the ignored `.local/clamav/engine/` directory. The package SHA-256 matches the official Cisco-Talos GitHub release (`57b6fd1d60cd87bafe800f97407ecdef0576d36b3900b8b7abcfbbabe88295fd`), and its detached signature verified against the official documentation's Cisco Talos signing key, fingerprint `5BAD CA26 65EF 59DC F8A2 3D8B 707F 0DB4 8083 6771`.

No system-wide service, Windows firewall rule or DNS setting was changed. The scanner configuration binds only to `127.0.0.1:3310`. The private local environment now points the API at this address. The scanner/updater must be started after a reboot; this setup does not register Windows autostart.

From PowerShell in the project directory:

```powershell
npm run scanner:update
npm run scanner:start
npm run scanner:status
npm run scanner:test
```

The first command must successfully obtain official virus definitions before startup is allowed. Startup launches hidden project-local ClamD and FreshClam processes; FreshClam checks for updates four times daily while running. ClamD reloads updated definitions on its self-check. Readiness may take time while definitions load. `scanner:test` checks clean bytes and the harmless EICAR antivirus test pattern in memory; it never saves EICAR to disk or uploads it to Supabase. Build the API first if its `dist` directory is missing.

Restart the API after changing its environment. `npm run scanner:stop` stops only recorded processes whose executable paths match this project's engine directory. Logs and definitions remain under `.local/clamav/`. Stop the updater before running a manual update; start it again afterward. Keep the engine and definitions maintained. Production scanner hosting, stale-definition monitoring and release policy remain separate work.

## Current verification limit

Package integrity/signature and supported executable options are verified. The first official FreshClam update failed because this environment could not resolve `database.clamav.net` or its TXT-version host. Public DNS confirmed the host exists; a direct HTTPS diagnostic with certificate verification returned HTTP 403. No definitions were downloaded, so the scanner was not started and clean/EICAR acceptance and the new real-Auth upload browser test have not run. Do not describe this installation as operational yet. The owner was asked to try `npm run scanner:update` in their own terminal; never disable TLS, replace official definitions with test signatures, or bypass scanning to work around the failure.

Sources: [official installation](https://docs.clamav.net/manual/Installing.html), [configuration](https://docs.clamav.net/manual/Usage/Configuration.html), [FreshClam troubleshooting](https://docs.clamav.net/faq/faq-freshclam.html).
