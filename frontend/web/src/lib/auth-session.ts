import { getAuthScope } from './auth-scope'
import * as community from './community-auth-session'
import * as relay from './relay-auth-session'
export type * from './relay-auth-session'
export {
  AuthRotationError,
  createRefreshRunner,
  isAuthBundle,
} from './relay-auth-session'
export const sessionRuntimes = { relay, community }
const runtime = () => sessionRuntimes[getAuthScope()]
export const applyAuthRotation: typeof relay.applyAuthRotation = (...args) =>
  runtime().applyAuthRotation(...args)
export const clearAuthentication: typeof relay.clearAuthentication = (
  ...args
) => runtime().clearAuthentication(...args)
export const clearAuthenticatedClientState: typeof relay.clearAuthenticatedClientState =
  (...args) => runtime().clearAuthenticatedClientState(...args)
export const refreshAuthentication: typeof relay.refreshAuthentication = (
  ...args
) => runtime().refreshAuthentication(...args)
export const resolveAuthentication: typeof relay.resolveAuthentication = (
  ...args
) => runtime().resolveAuthentication(...args)
export const bootstrapAuthentication: typeof relay.bootstrapAuthentication = (
  ...args
) => runtime().bootstrapAuthentication(...args)
export const getCommonHeaders: typeof relay.getCommonHeaders = (...args) =>
  runtime().getCommonHeaders(...args)
export const getFreshAuthHeaders: typeof relay.getFreshAuthHeaders = (
  ...args
) => runtime().getFreshAuthHeaders(...args)
export const applyAuthBundle: typeof relay.applyAuthBundle = (
  bundle,
  synchronizeTabs
) => {
  const scope = bundle.session.login_method.startsWith('community:')
    ? 'community'
    : 'relay'
  sessionRuntimes[scope].applyAuthBundle(bundle, synchronizeTabs)
}
