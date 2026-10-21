import forwarding from './download-forward-map.json'

// Only reviewed public installer URLs can use the relay. New catalogue entries
// keep their original URL until their file and redirect hosts are verified.
export function getForwardedDownload(url: string): string | undefined {
  return (forwarding as Record<string, string>)[url]
}
