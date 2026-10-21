export function readCommunityInvite() {
  try {
    return sessionStorage.getItem('skymoni:community-invite') ?? ''
  } catch {
    return ''
  }
}
export function clearCommunityInvite() {
  try {
    sessionStorage.removeItem('skymoni:community-invite')
  } catch {
    /* Storage may be unavailable. */
  }
}
