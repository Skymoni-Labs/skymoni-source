# Local programming request contract

Backend `v1.0.0-rc.39-skymoni.173-agent-limits` removes fixed message-count,
tool-count and per-message tool-call-count limits from the authenticated
AppAccount programming route. The request body remains bounded at4MiB;
output tokens remain bounded at4096. Model providers retain their own context
and API limits. Clients should compact oversized conversations explicitly.

The closed request type still removes endpoint, group and funding overrides.
Function-name/identifier shape, JSON object schemas, message roles, unique
tool-call IDs and complete call/result pairing are validated. Authentication,
published-model availability, route/group selection, beta eligibility, billing
and security-protection checks retain their previous order and behavior.

App0.2.48 and runtime0.1.4 negotiate4MiB broker frames with
`largeModelFrames=true`. Older hosts retain their original transport bound.
The device-command broker limit remains64KiB.
