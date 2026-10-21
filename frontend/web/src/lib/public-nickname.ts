export function publicNickname(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  return name && !/[@＠]/u.test(name) ? name : '社区成员'
}
