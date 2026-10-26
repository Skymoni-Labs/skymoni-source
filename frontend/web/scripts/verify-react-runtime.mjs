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
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultRoot = fileURLToPath(new URL('..', import.meta.url))
const manifestAt = (directory) =>
  JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'))

export function verifyReactRuntime(root = defaultRoot) {
  const projectRequire = createRequire(path.join(root, 'package.json'))
  const expected = realpathSync(projectRequire.resolve('react'))
  const reactDirectory = path.dirname(
    realpathSync(projectRequire.resolve('react/package.json'))
  )
  const version = manifestAt(reactDirectory).version
  const rendererDirectory = path.dirname(
    realpathSync(projectRequire.resolve('react-dom/package.json'))
  )
  if (manifestAt(rendererDirectory).version !== version) {
    throw new Error(
      'React and react-dom versions differ; reinstall the frozen dependency tree.'
    )
  }

  const containers = [path.join(root, 'node_modules')]
  const seenContainers = new Set()
  const seenPackages = new Set()
  let consumersChecked = 0

  function inspect(directory) {
    const actual = realpathSync(directory)
    if (
      seenPackages.has(actual) ||
      !existsSync(path.join(actual, 'package.json'))
    ) {
      return
    }
    seenPackages.add(actual)
    const manifest = manifestAt(actual)
    if (manifest.name === 'react' && actual !== reactDirectory) {
      throw new Error(
        `A second React runtime (${manifest.version}) is reachable; reinstall into an empty node_modules with the frozen lockfile.`
      )
    }
    const consumesReact = [
      'dependencies',
      'peerDependencies',
      'optionalDependencies',
    ].some((key) => manifest[key]?.react)
    if (consumesReact) {
      const consumerRequire = createRequire(path.join(actual, 'package.json'))
      if (realpathSync(consumerRequire.resolve('react')) !== expected) {
        throw new Error(
          `${manifest.name} resolves a different React runtime; reinstall into an empty node_modules with the frozen lockfile.`
        )
      }
      consumersChecked++
    }
    containers.push(path.join(actual, 'node_modules'))
    // Follow reachable peer containers in pnpm layouts. Do not scan an
    // unreferenced .pnpm cache: only dependencies reachable from installed links
    // can become a second runtime in the produced application.
    for (
      let parent = path.dirname(actual);
      parent !== path.dirname(parent);
      parent = path.dirname(parent)
    ) {
      if (path.basename(parent) === 'node_modules') {
        containers.push(parent)
        break
      }
    }
  }

  while (containers.length) {
    const next = containers.pop()
    if (!existsSync(next)) continue
    const actual = realpathSync(next)
    if (seenContainers.has(actual)) continue
    seenContainers.add(actual)
    for (const entry of readdirSync(actual, { withFileTypes: true })) {
      if (
        entry.name.startsWith('.') ||
        (!entry.isDirectory() && !entry.isSymbolicLink())
      ) {
        continue
      }
      const directory = path.join(actual, entry.name)
      if (entry.name.startsWith('@')) {
        for (const scoped of readdirSync(directory, { withFileTypes: true })) {
          if (scoped.isDirectory() || scoped.isSymbolicLink()) {
            inspect(path.join(directory, scoped.name))
          }
        }
      } else {
        inspect(directory)
      }
    }
  }
  return { version, packagesChecked: seenPackages.size, consumersChecked }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = verifyReactRuntime()
    console.log(
      `React runtime verified: ${result.version}; ${result.consumersChecked} consumers, ${result.packagesChecked} packages.`
    )
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'React runtime verification failed'
    )
    process.exitCode = 1
  }
}
