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
import type { Benefit, PreviewData } from '../types'

// Fictional preview fixtures only. Never import real account files here.
export function createPreviewData(): PreviewData {
  const benefits: Benefit[] = [
    {
      id: 'muse',
      name: 'Muse 音乐创作账号',
      category: 'account',
      tone: 'violet',
      summary: '把脑海里的旋律，变成下一首好听的歌。',
      format: 'markdown',
      instructions:
        '### 使用指南\n\n1. 打开下方的登录网址。\n2. 使用分配给你的账号和密码。\n3. 开始探索你的音乐灵感。\n\n需要帮助时，请通过站内客服入口联系我们。',
      fields: [
        {
          id: 'website',
          label: '登录网址',
          kind: 'link',
          value: 'https://example.com/muse-demo',
        },
        { id: 'account', label: '账号', kind: 'text', value: '' },
        { id: 'password', label: '密码', kind: 'secret', value: '' },
      ],
      stockMode: 'individual',
      validityDays: 30,
      enabled: true,
    },
    {
      id: 'design',
      name: '灵感设计素材包',
      category: 'resource',
      tone: 'sky',
      summary: '图标、配色与创作小工具，为灵感添一点颜色。',
      format: 'markdown',
      instructions:
        '### 资源说明\n\n打开资源链接即可查看素材。你可以把常用的内容收藏起来，随时回到仓库查找。',
      fields: [
        {
          id: 'link',
          label: '资源链接',
          kind: 'link',
          value: 'https://example.com/design-demo',
        },
        {
          id: 'note',
          label: '备注',
          kind: 'text',
          value: '这是一份用于展示界面的示例素材包。',
        },
      ],
      stockMode: 'shared',
      validityDays: 0,
      enabled: true,
    },
    {
      id: 'license',
      name: '创作工具体验卡',
      category: 'license',
      tone: 'amber',
      summary: '试试新工具，给你的工作流增加一点可能。',
      format: 'markdown',
      instructions:
        '### 兑换步骤\n\n复制激活码，在工具的激活页面填写即可。具体权益以资源说明为准。',
      fields: [{ id: 'license', label: '激活码', kind: 'secret', value: '' }],
      stockMode: 'individual',
      validityDays: 7,
      enabled: false,
    },
  ]
  const inventory = Array.from({ length: 8 }, (_, index) => ({
    id: `muse-stock-${index + 1}`,
    benefitId: 'muse',
    claimed: false,
    fields: benefits[0].fields.map((field) => {
      if (field.id === 'account') {
        return { ...field, value: `muse-demo-${index + 1}@example.com` }
      }
      if (field.id === 'password') {
        return { ...field, value: `DEMO-only-${index + 1}` }
      }
      return { ...field }
    }),
  }))
  return {
    benefits,
    inventory,
    codes: [
      {
        id: 'campaign-muse',
        code: 'SKY-MUSE-2026',
        benefitId: 'muse',
        mode: 'campaign',
        limit: 5,
        claimed: 0,
        target: 'all',
        expires: '2026-11-05',
        enabled: true,
      },
      {
        id: 'design-code',
        code: 'SKY-DESIGN-01',
        benefitId: 'design',
        mode: 'campaign',
        limit: 100,
        claimed: 1,
        target: 'all',
        expires: '2026-12-31',
        enabled: true,
      },
    ],
    warehouse: [
      {
        id: 'received-design',
        benefit: structuredClone(benefits[1]),
        fields: structuredClone(benefits[1].fields),
        received: '2026-10-04',
        expires: '',
        status: 'active',
        sourceCode: 'SKY-DESIGN-01',
      },
      {
        id: 'received-license',
        benefit: structuredClone(benefits[2]),
        fields: [
          {
            id: 'license',
            label: '激活码',
            kind: 'secret',
            value: 'DEMO-EXPIRED-0001',
          },
        ],
        received: '2026-09-20',
        expires: '2026-09-27',
        status: 'expired',
        sourceCode: 'OLD-DEMO-CODE',
      },
    ],
  }
}
