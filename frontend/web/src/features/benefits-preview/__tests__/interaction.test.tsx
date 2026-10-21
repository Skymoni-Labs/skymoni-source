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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { BenefitsPreview } from '..'
import { BenefitEditor } from '../components/benefit-editor'
import { createPreviewData } from '../lib/seed'

describe('local benefit preview interactions', () => {
  test('a user claims a popup gift and finds masked credentials in the warehouse', async () => {
    const user = userEvent.setup()
    render(<BenefitsPreview />)
    await user.click(
      screen.getByRole('button', { name: 'View the announcement' })
    )
    await user.click(screen.getByRole('button', { name: 'Claim benefit' }))
    expect(screen.getByLabelText('Benefit code')).toHaveValue('SKY-MUSE-2026')
    await user.click(screen.getByRole('button', { name: 'Redeem benefit' }))
    expect(
      await screen.findByText('Benefit added to your warehouse')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'View my warehouse' }))
    const museCard = screen
      .getAllByRole('article')
      .find((card) => card.textContent?.includes('Muse 音乐创作账号'))
    expect(museCard).toBeTruthy()
    if (!museCard) throw new Error('Redeemed Muse benefit is missing')
    await user.click(
      within(museCard).getByRole('button', { name: 'View contents' })
    )
    expect(screen.getByText('muse-demo-1@example.com')).toBeInTheDocument()
    expect(screen.queryByText('DEMO-only-1')).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Show sensitive field' })
    )
    expect(screen.getByText('DEMO-only-1')).toBeInTheDocument()
  })

  test('the wallet separates credit redemption from benefit redemption', async () => {
    const user = userEvent.setup()
    render(<BenefitsPreview />)
    await user.click(
      within(
        screen.getByRole('navigation', { name: 'Preview navigation' })
      ).getByRole('button', { name: /^Wallet$/ })
    )
    await user.type(screen.getByLabelText('Benefit code'), 'SKY-MUSE-2026')
    await user.click(screen.getByRole('button', { name: 'Redeem benefit' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(
      within(screen.getByRole('dialog')).getByLabelText('Benefit code')
    ).toHaveValue('SKY-MUSE-2026')
  })

  test('custom fields can be configured and saved without altering the source gift', async () => {
    const user = userEvent.setup()
    const benefit = createPreviewData().benefits[0]
    const onSave = vi.fn()
    render(
      <BenefitEditor benefit={benefit} onSave={onSave} onClose={vi.fn()} />
    )
    await user.click(screen.getByRole('button', { name: 'Add field' }))
    await user.type(screen.getByLabelText('Field name 4'), '备注')
    await user.type(screen.getByLabelText('Field value 4'), '自定义说明')
    await user.click(screen.getByRole('button', { name: 'Save benefit' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave.mock.calls[0][0].fields[3]).toMatchObject({
      label: '备注',
      value: '自定义说明',
    })
    expect(benefit.fields).toHaveLength(3)
  })

  test('invalid links prevent saving a delivery configuration', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <BenefitEditor
        benefit={createPreviewData().benefits[0]}
        onSave={onSave}
        onClose={vi.fn()}
      />
    )
    await user.clear(screen.getByLabelText('Field value 1'))
    await user.type(
      screen.getByLabelText('Field value 1'),
      'javascript:alert(1)'
    )
    await user.click(screen.getByRole('button', { name: 'Save benefit' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Website fields must use http or https'
    )
    expect(onSave).not.toHaveBeenCalled()
  })
})
