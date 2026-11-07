# Channel health pool capacity

The channel health worker previously returned before processing any pools when
the configuration contained more than 16 pools. Model status observations used a
separate worker, so model status could continue updating while channel pool
observations stopped.

The worker now processes every configured pool. Its shared database lease covers
two 45-second probes per pool plus 120 seconds of overhead, with the existing
1,800-second minimum. Releasing the lease still compares the exact owned expiry.
Probe limits, daily budgets, manual channel disables, route identity signatures,
model publication checks, and real-traffic-only pauses keep their existing rules.

Regression coverage runs the actual worker with 17 isolated missing-channel
pools and verifies that every pool receives a configuration-change observation
without making network requests or fabricating successful samples. A separate
lease regression covers a larger round exceeding the former fixed lease and
checks that an unrelated release cannot clear its lease.

Validation: `go test ./controller ./model -run
'Test(ChannelHealth|Health|GroupHealth|ModelHealth|MinimalHealthProbe)' -count=1`.
The Linux binary is built with the existing production frontend assets embedded.
