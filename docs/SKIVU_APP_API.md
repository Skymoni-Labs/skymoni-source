# Skivu Android account and update API

These endpoints support the existing relay wallet/subscription preference and an
explicitly selected, administrator-approved account-beta ledger. Catalog/group
permissions remain server-controlled. The separate legacy Android hardware-
attested BetaDevice API retains its original rollout gate; it is not a prerequisite
for the new account-eligibility channel.

## Direct native account sign-in (primary path)

`GET /api/app-account/login/options` returns:

```json
{"success":true,"data":{"password_login_enabled":true,"encryption":{"enabled":true,"kid":"public-key-id","public_key":"SPKI PEM","algorithm":"RSA-OAEP-SHA256","mgf1_hash":"SHA256"},"captcha":{"required":false,"site_key":""},"browser_fallback_supported":true}}
```

When encryption is disabled only `encryption.enabled` is present. When enabled,
fetch the current public key and send standard-base64 RSA-OAEP ciphertext using
SHA-256 for OAEP and MGF1, with an empty label. The existing `v2.` RSA-wrapped
AES-256-GCM envelope is also accepted by the shared password implementation.

`POST /api/app-account/login` accepts `{username,password}` when site encryption
is disabled, or `{username,password_encrypted,encryption_key_id}` when enabled.
It uses the original LOGIN rate-limit bucket, password verification, configured
Turnstile check, MFA policy and relay session limits. Send credentials only in
an HTTPS POST body, never in query strings, logs or persisted application state.
When Turnstile is required the existing `?turnstile=<verified-response>` convention
applies; use the system-browser authorization fallback if a native challenge
cannot be completed. No protection is disabled for the native endpoint.

Success returns `data:{access_token,token_type:"AppAccount",expires_at,session_id}`.
It returns **no dashboard JWT or refresh cookie**. If an additional factor is
required, HTTP 200 returns `success:true,data:{require_verification:true,flow_token,
expires_at,methods:[{method:"2fa"|"passkey",available,reason?}]}` instead of a session.

`POST /api/app-account/login/verify` accepts `{flow_token,method:"2fa",code}` for
TOTP or a one-use backup code. It accepts only native-origin login flows and
returns the same restricted AppAccount session after successful verification.
The shared factor lockout, challenge expiry, auth-version and single-use checks
remain active. Passkey-only or CAPTCHA ceremonies can use the existing browser
fallback below; do not silently ignore a required factor. A browser-origin MFA
flow cannot be submitted to the native endpoint to obtain broader credentials.

All primary-login failures retain the site's original `success:false,message`
and available authentication error codes (some use HTTP 200). Always check
`success`, not just the HTTP status. Invalid native verification requests return
400 INVALID_REQUEST. Passwords, ciphertext, OTPs and raw tokens are not added to
login audit records.

## Optional browser-assisted sign-in

The Android app generates a cryptographically random PKCE verifier (43–128
characters from `A-Z a-z 0-9 . _ ~ -`). Its challenge is unpadded base64url of
SHA-256(verifier). Never put the verifier or device code in browser URLs or logs.

1. `POST /api/app-account/authorize` with
   `{"code_challenge":"...","device_name":"My Android"}` returns
   `{success:true,data:{device_code,user_code,verification_uri,
   verification_uri_complete,expires_in:600,interval:5}}`.
2. Show the **case-sensitive 16-character** user code in the App and open
   `verification_uri_complete` in the system browser. The website performs its
   existing sign-in, CAPTCHA and MFA flow, then displays the account, device,
   code and wallet/subscription charging scope. The user confirms this is their
   own phone and approves or denies the request. There is no automatic approval.
3. Every five seconds, `POST /api/app-account/token` with
   `{device_code,code_verifier}`. Success returns
   `{success:true,data:{access_token,token_type:"AppAccount",expires_at,session_id}}`.
   Store the opaque credential in Android secure storage. No administrator JWT,
   dashboard refresh token or API key is returned.

All account JSON APIs use `{success:true,data:...}` or
`{success:false,code,message}`. Poll errors:

| HTTP | code | Action |
| --- | --- | --- |
| 403 | AUTHORIZATION_PENDING | Continue polling at the stated interval |
| 403 | ACCESS_DENIED | Stop polling |
| 400 | EXPIRED_TOKEN | Start a new authorization |
| 400 | INVALID_REQUEST | Check the request/verifier |
| 429 | SLOW_DOWN | Honor Retry-After |
| 429 | AUTH_SESSION_LIMIT / AUTH_ISSUANCE_LIMIT | Explain the existing website session limit; never log other devices out automatically |
| 401 | APP_SESSION_INVALID | Clear the native session and sign in again |
| 503 | APP_SERVICE_UNAVAILABLE | Retry later without fabricating account state |

The native session counts in the existing **relay** session scope, lasts at most
30 days, and can be revoked from the website's security session list. Account
disablement, password/security auth-version changes, expiry and session
revocation invalidate it. Native credentials authorize only the routes below.

Website-only endpoints are `GET /api/app-account/authorization?code=...` and
`POST /api/app-account/authorization` with `{user_code,decision:"approve"|"deny"}`.
They require a live relay browser session and the original same-origin guard;
API keys, PATs, community sessions and native credentials cannot approve grants.

## Account and catalog

Use `Authorization: AppAccount <access_token>` on:

* `GET /api/app-account/me`
* `GET /api/app-account/models` (ordinary catalog)
* `GET /api/app-account/models?funding=beta` (approved account-beta catalog)
* `GET /api/app-account/beta-status` (current account only)
* `DELETE /api/app-account/session` (revoke this native login)

`/me` data:

```json
{
  "user": {"id": 123, "username": "example", "display_name": "Example", "group": "default"},
  "wallet": {"balance": 100000, "used": 5000, "request_count": 2},
  "billing_preference": "subscription_first",
  "subscriptions": [{"id": 1, "plan_id": 1, "total": 100000, "used": 1000, "remaining": 99000, "unlimited": false, "expires_at": 2000000000, "reset_at": 0, "allow_wallet_overflow": false}],
  "quota_per_unit": 100000000,
  "currency": "USD",
  "session": {"id": "opaque-session-id", "expires_at": 2000000000, "device_name": "My Android"}
}
```

Amounts are integer quota units, **not tokens**. Display USD as
`amount / quota_per_unit` using the returned conversion; do not hard-code it.
Wallet and subscription balances are separate. Subscription `total=0` means
`unlimited=true` and `remaining=null`; an empty array means no active subscription.
Wallet used/request statistics follow the existing account accounting semantics.
Billing preference and per-plan wallet-overflow rules remain authoritative.

`/models` data is `{models:["model-id"],model_protocols:{"model-id":"chat"},quota_per_unit:...}`.
Protocol values are `chat` or `responses`. The server chooses the allowed route
group. The app must not request a different group or channel. `funding=beta`
requires an approved account and enabled account-beta channel; zero remaining
beta credit does not hide the catalog. Both sources follow the user-approved
policy of all published chat models within the account's existing permitted
groups. No separate beta-only model group has been created or opened.

## Account-beta status and administrator control

`/me` additionally includes `beta`; `/beta-status` returns that object as `data`:

```json
{"account":{"user_id":123,"status":"approved","balance":90000,"reserved":10000,"used":5000,"version":7,"application":"","review_note":""},"account_approved":true,"channel_enabled":true,"requires_device_proof":false,"can_chat":true,"blocked_reason":"","application_url":"https://skymoni.com/creators","quota_per_unit":100000000}
```

Status strings are `none`, `pending`, `approved`, `rejected`, `suspended`.
There is no `disabled` account status. Channel disablement is the independent
`channel_enabled` flag and must not be displayed as “not enrolled”. `balance`
is **already available credit after reservation**; do not subtract `reserved`
again. Display `reserved` and `used` separately. `can_chat` requires approved
status, enabled channel and positive balance. `blocked_reason` is NOT_APPROVED,
CHANNEL_DISABLED, QUOTA_EXHAUSTED or an empty string. The website application
entry remains at `application_url`. Only administrators approve/suspend and
assign or adjust the independent allowance; registering or applying grants none.

The new account-beta path uses the native account's server-side identity,
approval state, model permissions, rate limits and original transactional beta
reservation/settlement/refund ledger. It does not require device pairing. Its
rollout switch is `SKYMONI_APP_ACCOUNT_BETA_ENABLED=1`, independent of the unchanged
legacy `SKYMONI_APP_BETA_ENABLED` hardware-attested API. Native sessions, API keys,
wallet balances or client-supplied status/amount/user IDs cannot create approval.

## Chat

* `POST /api/app-account/chat/completions`: `{model,messages,stream,max_tokens}`
* `POST /api/app-account/responses`: `{model,input,instructions,stream,max_output_tokens}`

Both chat bodies accept optional `funding:"relay"|"beta"`; omitted means relay
for compatibility. Relay uses the original wallet/subscription preference. Beta
uses only the current authenticated account's administrator-approved beta ledger.
No missing approval, suspension, exhaustion or failure falls back to the relay
wallet. Explicit invalid/null/empty funding values return 400 INVALID_REQUEST.
The funding field is removed before forwarding upstream.

Messages/input contain 1–128 `{role,content}` entries. Roles are system/user/
assistant and content is a text string. Output limit is explicitly 1–4096.
Maximum body is 256 KiB (`413 REQUEST_TOO_LARGE`). Responses uses `store:false`.
Do not send tools, attachments, billing overrides or `stream_options`; the server
reconstructs a narrow allowed payload. Invalid contract/model returns
`400 INVALID_REQUEST`. Successful JSON and SSE are the native OpenAI-compatible
format of the selected protocol. Original pricing remains authoritative. Beta precheck errors are 403 BETA_NOT_APPROVED, 403 BETA_QUOTA_EXHAUSTED or 503 BETA_CHANNEL_DISABLED; further reservation failures retain the existing insufficient-quota response and never change funding source.

## Updates

`GET /api/app-update/latest?platform=android&abi=arm64-v8a&version_code=1` returns
`{success:true,data:{available,...}}`. No published release for that ABI gives
`{available:false}`. When present, metadata fields are:

`version`, `version_code`, `min_sdk`, `abi`, `download_url`, `sha256`, `size`,
`notes`, `published_at` (Unix seconds), `package_name`, `signer_sha256`.

Download is fixed HTTPS same-origin
`/api/app-update/download/<release-id>/<abi>` (GET/HEAD). A universal APK may have
both arm64-v8a and x86_64 entries pointing to the same approved asset. The server
streams only allowlisted `skyjjgw/skivu` GitHub Release APK assets, follows only
GitHub's expected HTTPS asset hosts, and does not persist APK copies. It is not
an arbitrary URL proxy. Range requests return 416; retry from the beginning.
The app verifies byte size, SHA-256, package name, increasing versionCode and
the installed package's signing identity, then uses Android's system installer
and normal unknown-source permission flow. Installation is never silent.

Deployment sets `SKYMONI_APP_RELEASES_FILE` to an administrator-controlled JSON
file in the existing data mount. Atomically publish validated metadata to update
the catalog without a backend rebuild. Schema:

```json
{"releases":[{"id":"v0.1.0-2","version":"0.1.0","version_code":2,"min_sdk":24,"abis":["arm64-v8a","x86_64"],"upstream":"https://github.com/skyjjgw/skivu/releases/download/v0.1.0-2/Skivu.apk","sha256":"64 lowercase hex characters","size":123,"notes":"Release notes","published_at":2000000000,"package_name":"com.skyjjgw.independent.ski","signer_sha256":"64 lowercase hex characters"}]}
```

Only publish an APK explicitly confirmed by the App maintainer. Metadata is
limited to 64 KiB/30 releases; an invalid configured manifest fails closed with
503 UPDATE_UNAVAILABLE. Empty/unconfigured release lists advertise no update.
Do not treat a development APK signer as a trusted production beta attestation
signer; those are independent policies.
