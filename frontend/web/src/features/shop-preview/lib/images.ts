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
export const MAX_PRODUCT_IMAGES = 12
export const PRODUCT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export async function prepareProductImage(
  file: File,
  maxBytes?: number
): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Unable to read image')
    for (let attempt = 0; attempt < 8; attempt++) {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) =>
            result
              ? resolve(result)
              : reject(new Error('Unable to read image')),
          'image/jpeg',
          0.85
        )
      })
      if (maxBytes === undefined || blob.size <= maxBytes) {
        return new File([blob], 'product-image.jpg', { type: 'image/jpeg' })
      }
      // Keep JPEG quality and aspect ratio; reduce dimensions only when needed.
      const scale = Math.min(0.85, Math.sqrt(maxBytes / blob.size) * 0.95)
      canvas.width = Math.max(1, Math.floor(canvas.width * scale))
      canvas.height = Math.max(1, Math.floor(canvas.height * scale))
    }
    throw new Error('Unable to prepare image within the size limit')
  } finally {
    bitmap.close()
  }
}
