/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// A read-only estimate. Keep these assumptions visible beside the result.
const NET_CNY_PER_SITE_CREDIT = (999 / 11_000) * (1 - 0.018)
const SOURCE_ASSUMPTIONS: Record<
  string,
  { cnyPerUpstreamUnit: number; targetMargin: number }
> = {
  yylx: { cnyPerUpstreamUnit: 6.72, targetMargin: 0.05 },
  '2000run': { cnyPerUpstreamUnit: 0.1, targetMargin: 0.1 },
  typesafe: { cnyPerUpstreamUnit: 7.2, targetMargin: 0.05 },
}

/** Minimum site credits per upstream price unit at the configured gross margin. */
export function suggestSiteCreditPrice(
  provider: string,
  effectiveUpstreamPrice: number | null | undefined,
  referenceUSDToCNY?: number | null
): number | null {
  const assumptions = SOURCE_ASSUMPTIONS[provider]
  if (
    !assumptions ||
    effectiveUpstreamPrice == null ||
    !Number.isFinite(effectiveUpstreamPrice) ||
    effectiveUpstreamPrice < 0
  ) {
    return null
  }

  const upstreamUnitCost =
    provider === 'yylx' &&
    referenceUSDToCNY != null &&
    Number.isFinite(referenceUSDToCNY) &&
    referenceUSDToCNY >= 4 &&
    referenceUSDToCNY <= 10
      ? Math.max(assumptions.cnyPerUpstreamUnit, referenceUSDToCNY)
      : assumptions.cnyPerUpstreamUnit
  const credits =
    (effectiveUpstreamPrice * upstreamUnitCost) /
    NET_CNY_PER_SITE_CREDIT /
    (1 - assumptions.targetMargin)
  // The pricing worksheet uses six decimals and rounds up to preserve the margin.
  return Math.ceil(credits * 1_000_000 - 1e-9) / 1_000_000
}
