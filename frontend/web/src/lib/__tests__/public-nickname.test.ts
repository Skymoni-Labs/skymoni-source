import { expect, test } from 'vitest'

import { publicNickname } from '../public-nickname'

test.each([
  ['  小林  ', '小林'],
  ['Moni Admin', 'Moni Admin'],
  ['', '社区成员'],
  ['   ', '社区成员'],
  [undefined, '社区成员'],
  [null, '社区成员'],
  ['member@example.com', 'member@example.com'],
  ['成员 <member@example.com>', '成员 <member@example.com>'],
  ['member＠example.com', 'member＠example.com'],
  ['小林@云间', '小林@云间'],
])('public nickname %s renders as %s', (value, expected) => {
  expect(publicNickname(value)).toBe(expected)
})
