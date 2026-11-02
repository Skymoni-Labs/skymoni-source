# Request quota precision

Request charges use the same exact-integer domain as wallet operations:
`-(2^53 - 1)` through `2^53 - 1` internal quota units. This is compatible with
the required 64-bit Go runtime, BIGINT database columns, Redis Lua arithmetic,
and JSON numbers consumed by browsers. Existing wallet and token balance checks
still apply. Model prices and the configured quota units per currency unit do
not change.

Older releases constrained request conversions to signed 32-bit integers. With
100,000,000 quota units per dollar, valid charges above $21.47483647 were either
rejected during pre-consumption or truncated at settlement. The shared quota
conversions now preserve those amounts through calculation, reservation,
settlement, refunds, and consumption logs. Invalid/non-finite values and amounts
outside the exact-integer representation range retain their existing guards.

This change affects future requests. It does not recalculate historical charges
or authorize retroactive balance adjustments. It also does not alter billing
policy for interrupted streams or local token estimation.
