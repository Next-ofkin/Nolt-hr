# Supabase database CA

`supabase-prod-ca-2021.crt` is a public CA certificate, not a private key or credential. Downloaded over HTTPS on 13 October 2026 from the URL configured in [Supabase's official dashboard source](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json):

`https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`

Subject: Supabase Root 2021 CA. Expiry: 26 April 2031. SHA-256 fingerprint:

`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`

The ignored hosted URLs use `sslmode=verify-full` and an absolute local `sslrootcert` path. On another machine, update that path to this file before using hosted commands. Do not turn off certificate or hostname verification to fix a connection error. See [Supabase SSL documentation](https://supabase.com/docs/guides/platform/ssl-enforcement).
