// Navigation metadata must not import the settings forms into the shared app shell.
import { createSectionRegistry } from './utils/section-registry'

const AUTH_NAV = [
  { id: 'basic-auth', titleKey: 'Basic Authentication' },
  { id: 'oauth', titleKey: 'OAuth Integrations' },
  { id: 'passkey', titleKey: 'Passkey Authentication' },
  { id: 'bot-protection', titleKey: 'Bot Protection' },
  { id: 'custom-oauth', titleKey: 'Custom OAuth' },
] as const
const authNav = createSectionRegistry<(typeof AUTH_NAV)[number]['id'], unknown>(
  {
    sections: AUTH_NAV.map((section) => ({ ...section, build: () => null })),
    defaultSection: 'basic-auth',
    basePath: '/system-settings/auth',
    urlStyle: 'path',
  }
)
export const AUTH_SECTION_IDS = authNav.sectionIds
export const AUTH_DEFAULT_SECTION = authNav.defaultSection
export const getAuthSectionNavItems = authNav.getSectionNavItems

const BILLING_NAV = [
  { id: 'quota', titleKey: 'Quota Settings' },
  { id: 'currency', titleKey: 'Currency & Display' },
  { id: 'model-pricing', titleKey: 'Model Pricing' },
  { id: 'group-pricing', titleKey: 'Group Pricing' },
  { id: 'payment', titleKey: 'Payment Gateway' },
  { id: 'checkin', titleKey: 'Check-in Rewards' },
] as const
const billingNav = createSectionRegistry<
  (typeof BILLING_NAV)[number]['id'],
  unknown
>({
  sections: BILLING_NAV.map((section) => ({ ...section, build: () => null })),
  defaultSection: 'quota',
  basePath: '/system-settings/billing',
  urlStyle: 'path',
})
export const BILLING_SECTION_IDS = billingNav.sectionIds
export const BILLING_DEFAULT_SECTION = billingNav.defaultSection
export const getBillingSectionNavItems = billingNav.getSectionNavItems

const CONTENT_NAV = [
  { id: 'dashboard', titleKey: 'Data Dashboard' },
  { id: 'announcements', titleKey: 'Announcements' },
  { id: 'api-info', titleKey: 'API Addresses' },
  { id: 'faq', titleKey: 'FAQ' },
  { id: 'uptime-kuma', titleKey: 'Uptime Kuma' },
  { id: 'chat', titleKey: 'Chat Presets' },
  { id: 'drawing', titleKey: 'Drawing' },
] as const
const contentNav = createSectionRegistry<
  (typeof CONTENT_NAV)[number]['id'],
  unknown
>({
  sections: CONTENT_NAV.map((section) => ({ ...section, build: () => null })),
  defaultSection: 'dashboard',
  basePath: '/system-settings/content',
  urlStyle: 'path',
})
export const CONTENT_SECTION_IDS = contentNav.sectionIds
export const CONTENT_DEFAULT_SECTION = contentNav.defaultSection
export const getContentSectionNavItems = contentNav.getSectionNavItems

const MODELS_NAV = [
  { id: 'global', titleKey: 'Global Model Configuration' },
  { id: 'gemini', titleKey: 'Gemini' },
  { id: 'claude', titleKey: 'Claude' },
  { id: 'grok', titleKey: 'Grok' },
  { id: 'model-deployment', titleKey: 'Model Deployment' },
] as const
const modelsNav = createSectionRegistry<
  (typeof MODELS_NAV)[number]['id'],
  unknown
>({
  sections: MODELS_NAV.map((section) => ({ ...section, build: () => null })),
  defaultSection: 'global',
  basePath: '/system-settings/models',
  urlStyle: 'path',
})
export const MODELS_SECTION_IDS = modelsNav.sectionIds
export const MODELS_DEFAULT_SECTION = modelsNav.defaultSection
export const getModelsSectionNavItems = modelsNav.getSectionNavItems

const OPERATIONS_NAV = [
  { id: 'behavior', titleKey: 'System Behavior' },
  { id: 'alerts', titleKey: 'Monitoring & Alerts' },
  { id: 'email', titleKey: 'SMTP Email' },
  { id: 'worker', titleKey: 'Worker Proxy' },
  { id: 'logs', titleKey: 'Log Maintenance' },
  { id: 'performance', titleKey: 'Performance' },
  { id: 'update-checker', titleKey: 'System maintenance' },
] as const
const operationsNav = createSectionRegistry<
  (typeof OPERATIONS_NAV)[number]['id'],
  unknown
>({
  sections: OPERATIONS_NAV.map((section) => ({
    ...section,
    build: () => null,
  })),
  defaultSection: 'behavior',
  basePath: '/system-settings/operations',
  urlStyle: 'path',
})
export const OPERATIONS_SECTION_IDS = operationsNav.sectionIds
export const OPERATIONS_DEFAULT_SECTION = operationsNav.defaultSection
export const getOperationsSectionNavItems = operationsNav.getSectionNavItems

const POLICY_NAV = [
  { id: 'filtering', titleKey: 'Request checks' },
  { id: 'routing', titleKey: 'Sessions and retries' },
  { id: 'health', titleKey: 'Channel health' },
] as const
const requestpoliciesNav = createSectionRegistry<
  (typeof POLICY_NAV)[number]['id'],
  unknown
>({
  sections: POLICY_NAV.map((section) => ({ ...section, build: () => null })),
  defaultSection: 'routing',
  basePath: '/system-settings/request-policies',
  urlStyle: 'path',
})
export const POLICY_SECTION_IDS = requestpoliciesNav.sectionIds
export const POLICY_DEFAULT_SECTION = requestpoliciesNav.defaultSection
export const getPolicySectionNavItems = requestpoliciesNav.getSectionNavItems

const SECURITY_NAV = [
  { id: 'rate-limit', titleKey: 'Rate Limiting' },
  { id: 'ssrf', titleKey: 'SSRF Protection' },
  { id: 'token-limits', titleKey: 'Token Limits' },
] as const
const securityNav = createSectionRegistry<
  (typeof SECURITY_NAV)[number]['id'],
  unknown
>({
  sections: SECURITY_NAV.map((section) => ({ ...section, build: () => null })),
  defaultSection: 'rate-limit',
  basePath: '/system-settings/security',
  urlStyle: 'path',
})
export const SECURITY_SECTION_IDS = securityNav.sectionIds
export const SECURITY_DEFAULT_SECTION = securityNav.defaultSection
export const getSecuritySectionNavItems = securityNav.getSectionNavItems

const SITE_NAV = [
  { id: 'creator-home', titleKey: '首页创作者展示' },
  { id: 'creators', titleKey: 'Creator review' },
  { id: 'software', titleKey: 'Software management' },
  { id: 'pricing-groups', titleKey: 'Edit model square groups' },
  { id: 'pricing-guide', titleKey: 'Model square guide' },
  { id: 'system-info', titleKey: 'System Information' },
  { id: 'notice', titleKey: 'System Notice' },
  { id: 'header-navigation', titleKey: 'Header navigation' },
  { id: 'sidebar-modules', titleKey: 'Sidebar modules' },
] as const
const siteNav = createSectionRegistry<(typeof SITE_NAV)[number]['id'], unknown>(
  {
    sections: SITE_NAV.map((section) => ({ ...section, build: () => null })),
    defaultSection: 'system-info',
    basePath: '/system-settings/site',
    urlStyle: 'path',
  }
)
export const SITE_SECTION_IDS = siteNav.sectionIds
export const SITE_DEFAULT_SECTION = siteNav.defaultSection
export const getSiteSectionNavItems = siteNav.getSectionNavItems
