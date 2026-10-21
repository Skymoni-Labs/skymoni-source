/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

// Package 01 reference quote: CNY 9.90 buys 99 wallet USD credits. Other
// packages and payment channels may have a different effective cost.
export const STANDARD_PACKAGE_CNY = 9.9
export const STANDARD_PACKAGE_SITE_CREDITS = 99
export const STANDARD_CNY_PER_SITE_CREDIT =
  STANDARD_PACKAGE_CNY / STANDARD_PACKAGE_SITE_CREDITS
// Used only while the server has not published a verified daily reference rate.
export const LEGACY_CNY_PER_REAL_USD = 7.3

export function siteCreditUSDValue(cnyPerRealUSD: number): number {
  return STANDARD_CNY_PER_SITE_CREDIT / cnyPerRealUSD
}
