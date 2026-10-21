export function isCloudDriveDownload(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'pan.quark.cn'
  } catch {
    return false
  }
}

export function softwareDownloadHeading(
  entry: { downloadUrl: string; downloads?: unknown[] },
  fallback = 'Official website'
): string {
  if (isCloudDriveDownload(entry.downloadUrl)) return 'Cloud drive download'
  if (entry.downloadUrl || entry.downloads?.length) return 'Free download'
  return fallback
}

export function softwareDownloadNote(entry: {
  downloadUrl: string
  downloads?: unknown[]
}): string {
  if (isCloudDriveDownload(entry.downloadUrl)) {
    return 'Opens the cloud drive download page'
  }
  if (entry.downloads?.length) {
    return 'Choose an installer or official platform entry'
  }
  if (entry.downloadUrl) return 'No sign-in required'
  return 'Opens the official website'
}
