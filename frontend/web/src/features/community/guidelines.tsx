import { Link } from '@tanstack/react-router'
import { BookOpen, Code2, HeartHandshake, ShieldCheck } from 'lucide-react'

export function CommunityGuidelines() {
  return <main className='sf-guidelines'><span className='sf-rail-kicker'>A PLACE TO BELONG</span><h1>欢迎来到 skymoni 社区</h1><p className='sf-guidelines-lead'>这里连接技术、创作与认真分享的人。带着好奇来，带着新的想法离开。</p><div className='sf-guideline-grid'><section><HeartHandshake /><h2>友善地交流</h2><p>讨论观点，尊重他人。清楚表达不同意见，避免人身攻击、骚扰与歧视。</p></section><section><BookOpen /><h2>让内容有价值</h2><p>为话题选择合适的分类与标题。提问时写清背景，分享时说明来源，帮助后来的人找到答案。</p></section><section><ShieldCheck /><h2>保护隐私与安全</h2><p>不要公开密码、密钥、他人隐私或未获授权的内容。遇到问题可以使用举报，由管理员处理。</p></section><section><Code2 /><h2>给创作一个位置</h2><p>保留署名与开源许可。作品广场、GitHub 导入、软件版本与附件，都可以从侧栏的创作者工作台进入。</p></section></div><div className='sf-guide-links'><Link to='/creators/new'>发起话题</Link><Link to='/creators/projects'>浏览作品广场</Link><Link to='/creators/workspace'>进入创作工作台</Link></div></main>
}
