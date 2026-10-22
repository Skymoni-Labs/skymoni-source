# Skivu Android account and update API

These endpoints use the existing relay account wallet, subscription preference,
model catalog and permitted groups. They never select beta funding. The separate
Android hardware-attested beta service retains its original rollout gate.

## Browser-assisted account sign-in

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
* `GET /api/app-account/models`
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
group. The app must not request a different group or channel.

## Chat

* `POST /api/app-account/chat/completions`: `{model,messages,stream,max_tokens}`
* `POST /api/app-account/responses`: `{model,input,instructions,stream,max_output_tokens}`

Messages/input contain 1–128 `{role,content}` entries. Roles are system/user/
assistant and content is a text string. Output limit is explicitly 1–4096.
Maximum body is 256 KiB (`413 REQUEST_TOO_LARGE`). Responses uses `store:false`.
Do not send tools, attachments, billing overrides or `stream_options`; the server
reconstructs a narrow allowed payload. Invalid contract/model returns
`400 INVALID_REQUEST`. Successful JSON and SSE are the native OpenAI-compatible
format of the selected protocol. Original relay errors/pricing/charging apply.

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
