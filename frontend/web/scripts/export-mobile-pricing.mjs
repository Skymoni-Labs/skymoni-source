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

For commercial licensing, please contact support@quantumnous.com
*/
// Publish the same reviewed reference policy for native clients. Actual model
// availability, group membership and charges continue to come from /api/pricing.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
async function literal(file, name) {
  const source = await readFile(path.join(root, file), 'utf8')
  const value = source.match(
    new RegExp(`const ${name}[^=]*= (\\{[\\s\\S]*?\\n\\})`)
  )?.[1]
  if (!value) throw new Error(`Missing reviewed pricing policy: ${name}`)
  // These policy maps contain only quoted keys and numeric arrays. Fail closed
  // if their source becomes executable code; never evaluate source or input.
  return JSON.parse(
    value
      .replaceAll(/'([^'\\]*)'/g, (_, text) => JSON.stringify(text))
      .replaceAll(/,\s*([}\]])/g, '$1')
  )
}
const domestic = JSON.parse(
  await readFile(path.join(root, 'moni/domestic-official-pricing.json'), 'utf8')
)
const data = {
  schema: 1,
  cny_per_credit: domestic.cny_per_credit,
  openai: await literal(
    'src/features/pricing/lib/official-comparison.ts',
    'officialPrices'
  ),
  claude: await literal(
    'src/features/pricing/lib/matrix-price.ts',
    'claudePrices'
  ),
  domestic: domestic.models,
  icons: {},
}
await mkdir(path.join(root, 'public'), { recursive: true })
await writeFile(
  path.join(root, 'public/pricing-reference.json'),
  JSON.stringify(data)
)
console.log('Native pricing reference exported from website policy.')
