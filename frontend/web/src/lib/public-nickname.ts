export function publicNickname(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  // The relay account display name is authoritative, including names with @.
  return name || '社区成员'
}
