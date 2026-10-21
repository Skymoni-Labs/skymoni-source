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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { describe, expect, test, vi } from 'vitest'

import zh from '@/i18n/locales/zh.json'

import { ShopPreview } from '..'
import { CheckoutDialog, ProductDialog } from '../components/checkout'
import { createShopData } from '../lib/data'

describe('local store interaction', () => {
  test('product details keep download separate and switch package price before purchase', async () => {
    const user = userEvent.setup()
    const data = createShopData()
    const buy = vi.fn()
    const product = {
      ...data.products[0],
      attributes: [
        {
          label: 'Windows 下载',
          value: 'https://skymoni.com/drip-releases/Drip-Setup-0.3.28-x64.exe',
        },
        { label: '软件版本', value: '0.3.28' },
        { label: '使用期限', value: '兑换后 100 天' },
      ],
    }
    render(
      <ProductDialog
        product={product}
        data={data}
        onClose={vi.fn()}
        onBuy={buy}
      />
    )
    const dialog = screen.getByRole('dialog')
    expect(
      within(dialog).getByRole('link', { name: /Download.*Windows/ })
    ).toHaveAttribute(
      'href',
      'https://skymoni.com/drip-releases/Drip-Setup-0.3.28-x64.exe'
    )
    expect(within(dialog).getByText('0.3.28')).toBeInTheDocument()
    expect(within(dialog).getByText('兑换后 100 天')).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole('radio', { name: /扩展 · 90 天/ })
    )
    expect(
      within(dialog).getByRole('radio', { name: /扩展 · 90 天/ })
    ).toBeChecked()
    const footer = dialog.querySelector('[data-slot="dialog-footer"]')
    expect(footer).not.toBeNull()
    expect(within(footer as HTMLElement).getByText('249')).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole('button', { name: 'Buy with wallet credit' })
    )
    expect(buy).toHaveBeenCalledWith('extended')
  })

  test('edit details opens promotional content directly and saves it for customers without buying', async () => {
    const user = userEvent.setup()
    render(<ShopPreview />)
    const navigation = within(
      screen.getByRole('navigation', { name: 'Store navigation' })
    )
    await user.click(
      navigation.getByRole('button', { name: 'Product management' })
    )
    await user.click(screen.getAllByRole('button', { name: 'Edit details' })[0])
    expect(
      screen.getByRole('tab', { name: 'Display content' })
    ).toHaveAttribute('aria-selected', 'true')
    const editor = screen.getByRole('dialog', { name: 'Edit product details' })
    await user.selectOptions(
      within(editor).getByLabelText('Content format'),
      'html'
    )
    await user.clear(within(editor).getByLabelText('Public product details'))
    await user.type(
      within(editor).getByLabelText('Public product details'),
      '<h2>Muse introduction</h2><p>Custom promotional content</p>'
    )
    await user.click(
      within(editor).getByRole('button', { name: 'Add attribute' })
    )
    const attributeNames = within(editor).getAllByLabelText('Attribute name')
    const attributeValues = within(editor).getAllByLabelText('Attribute value')
    const addedName = attributeNames.at(-1)
    const addedValue = attributeValues.at(-1)
    if (!addedName || !addedValue) throw new Error('Missing added attribute')
    await user.type(addedName, 'Service')
    await user.type(addedValue, 'Setup guidance')
    expect(
      within(editor).getByRole('heading', { name: 'Muse introduction' })
    ).toBeInTheDocument()
    await user.click(
      within(editor).getByRole('button', { name: 'Save product' })
    )
    await user.click(navigation.getByRole('button', { name: 'Store' }))
    await user.click(screen.getAllByRole('button', { name: 'Details' })[0])
    const detail = screen.getByRole('dialog')
    expect(
      within(detail).getByRole('heading', { name: 'Muse introduction' })
    ).toBeInTheDocument()
    expect(
      within(detail).getByText('Custom promotional content')
    ).toBeInTheDocument()
    expect(within(detail).getByText('Setup guidance')).toBeInTheDocument()
    expect(within(detail).getAllByText('99')).not.toHaveLength(0)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await user.click(
      within(detail).getAllByRole('button', { name: 'Close' })[0]
    )
    await user.click(navigation.getByRole('button', { name: 'My orders' }))
    expect(screen.getByText('No purchases yet')).toBeInTheDocument()
  })

  test('Simplified Chinese resolves all purchase notice text from application resources', async () => {
    const translations = createInstance()
    await translations.init({
      resources: { zhCN: zh },
      lng: 'zhCN',
      fallbackLng: false,
      keySeparator: false,
      nsSeparator: false,
    })
    expect(translations.t('Purchase notice')).toBe('购买须知')
    expect(translations.t('Product details')).toBe('商品详情')
    expect(translations.t('Edit details')).toBe('编辑详情')
    expect(translations.t('Edit product details')).toBe('编辑商品详情')
    expect(translations.t('Buy product')).toBe('购买')
    expect(
      translations.t(
        'I understand there is no online self-service refund option and will contact customer support about issues.'
      )
    ).toBe('我已阅读购买须知，了解售后问题需联系平台客服处理。')
    expect(
      translations.t(
        'There is no online self-service refund option. Please review the product and delivery details before paying. For delivery, account, or payment issues, contact customer support. Applicable legal rights remain unaffected.'
      )
    ).toBe(
      '商城不提供在线自助退款入口。付款前请核对商品与交付信息；如遇交付、账号或扣款问题，请联系平台客服核实处理。依法享有的权利不受本须知影响。'
    )
  })
  test('canceling payment preserves the balance and creates no order', async () => {
    const user = userEvent.setup()
    render(<ShopPreview />)
    await user.click(screen.getAllByRole('button', { name: 'Buy product' })[0])
    await user.click(
      screen.getByRole('button', { name: 'Buy with wallet credit' })
    )
    const confirmation = screen.getByRole('alertdialog')
    expect(
      within(confirmation).getByText('Balance after purchase')
    ).toBeInTheDocument()
    await user.click(
      within(confirmation).getByRole('button', { name: 'Cancel' })
    )
    expect(
      screen.getByRole('region', { name: 'Store introduction' })
    ).toHaveTextContent('399')
    await user.click(
      within(
        screen.getByRole('navigation', { name: 'Store navigation' })
      ).getByRole('button', { name: 'My orders' })
    )
    expect(screen.getByText('No purchases yet')).toBeInTheDocument()
  })

  test('a purchase reaches the warehouse and passwords stay masked until revealed', async () => {
    const user = userEvent.setup()
    render(<ShopPreview />)
    await user.click(screen.getAllByRole('button', { name: 'Buy product' })[0])
    await user.click(
      screen.getByRole('button', { name: 'Buy with wallet credit' })
    )
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Confirm payment' }))
    expect(await screen.findByText('Purchase complete')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'View delivery' }))
    expect(screen.getByText('muse-demo-1@example.com')).toBeInTheDocument()
    expect(screen.queryByText('DEMO-only-1')).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Show sensitive field' })
    )
    expect(screen.getByText('DEMO-only-1')).toBeInTheDocument()
  })

  test('payment requires explicit acknowledgement and unchecking disables payment again', async () => {
    const user = userEvent.setup()
    const pay = vi.fn()
    const data = createShopData()
    render(
      <CheckoutDialog
        product={data.products[0]}
        balanceCents={data.balanceCents}
        onClose={() => {}}
        onConfirm={pay}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'There is no online self-service refund option'
    )
    const confirm = screen.getByRole('button', { name: 'Confirm payment' })
    const acknowledgement = screen.getByRole('checkbox', {
      name: 'I understand there is no online self-service refund option and will contact customer support about issues.',
    })
    expect(acknowledgement).not.toBeChecked()
    expect(confirm).toBeDisabled()
    await user.click(confirm)
    expect(pay).not.toHaveBeenCalled()
    acknowledgement.focus()
    await user.keyboard('[Space]')
    expect(acknowledgement).toBeChecked()
    expect(confirm).toBeEnabled()
    await user.click(acknowledgement)
    expect(confirm).toBeDisabled()
  })

  test('canceling an acknowledged purchase requires a fresh acknowledgement on reopening', async () => {
    const user = userEvent.setup()
    render(<ShopPreview />)
    await user.click(screen.getAllByRole('button', { name: 'Buy product' })[0])
    await user.click(
      screen.getByRole('button', { name: 'Buy with wallet credit' })
    )
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getAllByRole('button', { name: 'Buy product' })[0])
    await user.click(
      screen.getByRole('button', { name: 'Buy with wallet credit' })
    )
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(
      screen.getByRole('button', { name: 'Confirm payment' })
    ).toBeDisabled()
  })

  test('acknowledging the policy cannot enable payment with insufficient balance', async () => {
    const user = userEvent.setup()
    const pay = vi.fn()
    render(
      <CheckoutDialog
        product={createShopData().products[0]}
        balanceCents={0}
        onClose={() => {}}
        onConfirm={pay}
      />
    )
    await user.click(screen.getByRole('checkbox'))
    expect(
      screen.getByRole('button', { name: 'Confirm payment' })
    ).toBeDisabled()
    expect(screen.getByText('Not enough wallet credit')).toBeInTheDocument()
    expect(pay).not.toHaveBeenCalled()
  })
})
