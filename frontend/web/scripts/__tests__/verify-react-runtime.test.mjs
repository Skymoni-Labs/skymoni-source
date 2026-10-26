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
import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { verifyReactRuntime } from '../verify-react-runtime.mjs'

function packageAt(directory, name, version, extra = {}) {
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ name, version, main: 'index.js', ...extra })
  )
  writeFileSync(path.join(directory, 'index.js'), 'module.exports = {}\n')
}

function cleanupFixture(root, base) {
  const resolved = path.resolve(root)
  if (
    path.dirname(resolved) !== base ||
    !path.basename(resolved).startsWith('skymoni-react-runtime-')
  ) {
    throw new Error('Unsafe temporary cleanup target')
  }
  rmSync(resolved, { recursive: true, force: true })
}

function fixture(run) {
  const base = path.resolve(os.tmpdir())
  const root = mkdtempSync(path.join(base, 'skymoni-react-runtime-'))
  try {
    writeFileSync(path.join(root, 'package.json'), '{"private":true}')
    packageAt(path.join(root, 'node_modules/react'), 'react', '19.2.7')
    packageAt(
      path.join(root, 'node_modules/react-dom'),
      'react-dom',
      '19.2.7',
      { peerDependencies: { react: '^19' } }
    )
    run(root)
  } finally {
    cleanupFixture(root, base)
  }
}

function mixedConsumer(root, version) {
  const peerContainer = path.join(
    root,
    'node_modules/.pnpm/loading-bar-peer/node_modules'
  )
  const consumer = path.join(peerContainer, 'react-top-loading-bar')
  packageAt(path.join(peerContainer, 'react'), 'react', version)
  packageAt(consumer, 'react-top-loading-bar', '3.0.2', {
    peerDependencies: { react: '^19' },
  })
  symlinkSync(
    consumer,
    path.join(root, 'node_modules/react-top-loading-bar'),
    'junction'
  )
}

test('accepts one canonical runtime shared by all React consumers', () =>
  fixture((root) => {
    packageAt(path.join(root, 'node_modules/ui'), 'ui', '1.0.0', {
      peerDependencies: { react: '^19' },
    })
    const result = verifyReactRuntime(root)
    assert.equal(result.version, '19.2.7')
    assert.equal(result.consumersChecked, 2)
  }))

test('rejects a leftover pnpm consumer resolving the older installation runtime', () =>
  fixture((root) => {
    mixedConsumer(root, '19.3.1')
    assert.throws(
      () => verifyReactRuntime(root),
      /different React runtime|second React runtime/
    )
  }))

test('rejects a second runtime even when its version matches', () =>
  fixture((root) => {
    mixedConsumer(root, '19.2.7')
    assert.throws(
      () => verifyReactRuntime(root),
      /different React runtime|second React runtime/
    )
  }))

test('ignores stale but unreachable package-manager cache entries', () =>
  fixture((root) => {
    packageAt(
      path.join(root, 'node_modules/.pnpm/react-old/node_modules/react'),
      'react',
      '19.3.1'
    )
    assert.doesNotThrow(() => verifyReactRuntime(root))
  }))

test('rejects mismatched application and renderer versions', () =>
  fixture((root) => {
    packageAt(
      path.join(root, 'node_modules/react-dom'),
      'react-dom',
      '19.3.1',
      { peerDependencies: { react: '^19' } }
    )
    assert.throws(() => verifyReactRuntime(root), /versions differ/)
  }))
