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
import type { ShopData, ShopProduct } from '@/features/shop-preview/types'

// Local copies of the existing storefront's public display content, captured 2026-10-07.
// Availability is a boolean preview hint, not a live inventory quantity. No delivery secrets are included.
export const publicPreviewProducts: ShopProduct[] = [
  {
    id: 'drip',
    benefit: {
      id: 'drip',
      name: 'Drip 浏览器套餐',
      summary:
        'Windows 浏览器与 Drip 线路兑换码；100/200/500 GiB，兑换后有效 100 天。',
      category: 'license',
      tone: 'sky',
      format: 'html',
      instructions: '',
      fields: [],
      stockMode: 'individual',
      validityDays: 0,
      enabled: true,
    },
    priceCents: 20000,
    delivery: 'instant',
    featured: true,
    cardSize: 'large',
    sortOrder: 0,
    categoryLabel: 'Drip 代理',
    onSale: true,
    defaultPackageName: '100 GiB',
    packages: [
      {
        id: 'traffic-200',
        name: '200 GiB',
        priceCents: 36000,
        validityDays: 0,
        delivery: 'instant',
      },
      {
        id: 'traffic-500',
        name: '500 GiB',
        priceCents: 80000,
        validityDays: 0,
        delivery: 'instant',
      },
    ],
    stockByPackage: {
      default: 1,
      'traffic-200': 1,
      'traffic-500': 1,
    },
    coverUrl:
      'https://skymoni.com/api/shop/images/71e84d6ebe05d6079650fcdc4a0fc5f9447427013084b553e9bba24a9982b416.jpg',
    imagesEnabled: true,
    images: [
      'https://skymoni.com/api/shop/images/71e84d6ebe05d6079650fcdc4a0fc5f9447427013084b553e9bba24a9982b416.jpg',
      'https://skymoni.com/api/shop/images/80175155c69093f5977eb4b6ed546c7092305ce7fd214b4596cf9fd2b7d94ce2.jpg',
      'https://skymoni.com/api/shop/images/6dbec1d5fa0abaf45d51406885c7dbedf9f4b5e591b754bea415aaa1060cf631.jpg',
    ],
    content:
      '<section>\n  <p>Drip 是 Windows 桌面浏览器，内置代理中心，可管理订阅、切换节点和查看流量；新标签页支持搜索、常用站点和自定义壁纸。可使用直连、个人代理或已获授权的 Drip 线路。</p>\n<p><strong>  主要是为了浏览器可以直连搜索，可以和国内网络隔离，作为浏览器专用</strong></p>\n  <p><strong>浏览器可免费下载；本商品交付 Drip 默认线路兑换码，未兑换时不显示付费线路。</strong></p>\n</section>\n<section>\n  <h3>套餐与兑换</h3>\n  <ul>\n    <li><strong>流量与期限：</strong>100 / 200 / 500 GiB，美国代理2线路，兑换成功后有效 100 天。</li>\n    <li><strong>领取方式：</strong>使用站内额度购买，每份交付一张一次性兑换码，自动存入「我的仓库」。</li>\n    <li><strong>兑换账号：</strong>在当前登录的独立 Drip 账号中兑换，多张兑换码可叠加；兑换前请确认登录身份。</li>\n  </ul>\n</section>\n<section>\n  <h3>安装与售后</h3>\n  <p>Windows 10/11 x64 · 版本 0.3.28 · 安装包约 390 MB。请从本页 skymoni.com 下载入口获取；代码签名尚未完成，系统可能提示「未知发布者」。</p>\n  <p>暂无在线自助退款入口。交付、账号或扣款异常请联系平台客服核实 <b>skymoni客服：792521914@qq.com<b></b></b></p><b><b>\n</b></b></section>',
    contentFormat: 'html',
    attributes: [
      {
        label: 'Windows 下载',
        value: 'https://skymoni.com/drip-releases/Drip-Setup-0.3.28-x64.exe',
      },
      {
        label: '使用期限',
        value: '兑换后 100 天',
      },
      {
        label: '软件版本',
        value: '0.3.28',
      },
      {
        label: '系统要求',
        value: 'Windows 10/11 x64',
      },
      {
        label: '区域',
        value: '美国',
      },
    ],
  },
  {
    id: 'muse',
    benefit: {
      id: 'muse',
      name: 'Muse 账号',
      summary: '购买后自动交付一个账号，账号与密码可在「我的仓库」查看。',
      category: 'account',
      tone: 'sky',
      format: 'html',
      instructions: '',
      fields: [],
      stockMode: 'individual',
      validityDays: 0,
      enabled: true,
    },
    priceCents: 9900,
    delivery: 'instant',
    featured: false,
    sortOrder: 1,
    categoryLabel: '账号',
    onSale: true,
    defaultPackageName: '单个账号',
    stockByPackage: {
      default: 1,
    },
    coverUrl:
      'https://skymoni.com/api/shop/images/a5511a4abf1aae5698c005aa7baeb3929ef3373d6194c606a2bada68dacbaf93.jpg',
    imagesEnabled: true,
    images: [
      'https://skymoni.com/api/shop/images/76668b6d2a84d8dbfc63eca3fc64c80b24b35f95e1337484e40f8cbaa17c7d8b.jpg',
      'https://skymoni.com/api/shop/images/a5511a4abf1aae5698c005aa7baeb3929ef3373d6194c606a2bada68dacbaf93.jpg',
      'https://skymoni.com/api/shop/images/b2d9afe6fb577a68f3ce25245566f2dd95c6ad5ef772eeb61132b81e456f6424.jpg',
      'https://skymoni.com/api/shop/images/d6ab23c8c2d6d4a175b9feea0e26fd9afcfaac6b6b463b727a4a181dac37ad2e.jpg',
    ],
    content:
      '\n<article style="max-width:780px;margin:0 auto;border:1px solid #e2e8ed;border-radius:20px;overflow:hidden;background:#ffffff;color:#172b36;font-family:system-ui,-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'Microsoft YaHei\',sans-serif;font-size:14px;line-height:1.8;overflow-wrap:anywhere;">\n  <header style="padding:28px 24px;background:linear-gradient(135deg,#e9f7ff 0%,#f0fbf6 100%);border-bottom:1px solid #e2e8ed;">\n    <p style="margin:0 0 10px;font-size:12px;font-weight:600;letter-spacing:2px;color:#2c7387;">SKYMONI · DIGITAL ACCOUNT</p>\n    <h1 style="margin:0;font-size:clamp(30px,7vw,42px);font-weight:750;line-height:1.15;letter-spacing:-1px;color:#123746;">Muse</h1>\n    <p style="margin:12px 0 8px;font-size:20px;font-weight:650;line-height:1.5;">让琐碎任务，少占用你的时间。</p>\n    <p style="margin:0;color:#4f6775;">Meta 推出的个人 AI 助理。通过对话提出目标，让 Muse 协助整理信息、安排计划，并在获得授权后推进网页和应用中的任务。</p>\n    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;">\n      <span style="padding:3px 12px;border:1px solid #cce2eb;border-radius:999px;background:#ffffff;color:#2e6072;">个人 AI 助理</span>\n      <span style="padding:3px 12px;border:1px solid #cce2eb;border-radius:999px;background:#ffffff;color:#2e6072;">任务规划</span>\n      <span style="padding:3px 12px;border:1px solid #cce2eb;border-radius:999px;background:#ffffff;color:#2e6072;">授权后执行</span>\n    </div>\n  </header>\n<section style="padding:20px 24px;border-top:1px solid #e2e8ed;"><h2 style="margin:0 0 8px;font-size:18px;">skymonimail 邮箱入口</h2><p style="margin:0;">Muse 使用邮箱验证码登录。账号对应的收件邮箱为 skymoni 邮箱，仓库中的密码用于登录邮箱。获取验证码后，打开 <a href="https://mail.skymoni.com/login" target="_blank" rel="noopener noreferrer" style="color:#0087d7;">skymonimail 邮箱</a>收取邮件，再回到 Muse 填写验证码。</p></section></article>',
    contentFormat: 'html',
  },
  {
    id: 'mail',
    benefit: {
      id: 'mail',
      name: 'skymoni 邮箱注册邀请码',
      summary:
        '10 站内额度兑换 1 个注册码，自选邮箱名称注册 @skymoni.com 邮箱。每码限 1 名用户成功注册，购买后自动交付。',
      category: 'license',
      tone: 'sky',
      format: 'html',
      instructions: '',
      fields: [],
      stockMode: 'individual',
      validityDays: 0,
      enabled: true,
    },
    priceCents: 1000,
    delivery: 'instant',
    featured: false,
    sortOrder: 2,
    categoryLabel: '邮箱服务',
    onSale: true,
    defaultPackageName: '单次注册',
    stockByPackage: {
      default: 1,
    },
    content:
      '<h2>skymoni 邮箱注册邀请码</h2>\n<p><strong>10 站内额度 / 个 · 单次注册 · 自动交付</strong></p>\n<p>购买一枚注册码，即可在邮箱站自选未被占用的名称，注册属于自己的 <strong>名称@skymoni.com</strong> 邮箱用户。</p>\n<h3>你将获得</h3>\n<ul>\n<li>1 枚独立注册码，每码仅限 1 名用户成功注册。</li>\n<li>@skymoni.com 邮箱注册资格，可收取邮件与验证码。</li>\n<li>自己设置登录密码，购买后的注册码和使用说明保存在「我的仓库」。</li>\n</ul>\n<h3>使用方法</h3>\n<p>购买 → 我的仓库查看注册码 → 打开 <a href="https://mail.skymoni.com/login" target="_blank" rel="noopener noreferrer">skymoni Mail</a> → 点击「没有账号」注册 → 填写邮箱名称、密码和注册码。</p>\n<h3>使用说明</h3>\n<ul>\n<li>注册码有效至 <strong>2099-12-31</strong>；成功注册后不能用于第二名用户。</li>\n<li>商品交付的是注册资格，邮箱名称由你自行选择。</li>\n<li>当前提供收件服务，不提供对外发信。第三方平台是否接受本邮箱域名，由对应平台决定。</li>\n<li>数字商品购买后不支持退款；交付或注册问题请联系管理员处理。</li>\n</ul>\n',
    contentFormat: 'html',
  },
]

export const publicPreviewData: ShopData = {
  products: publicPreviewProducts,
  balanceCents: 0,
  orders: [],
  inventory: [],
  codes: [],
  warehouse: [],
}
