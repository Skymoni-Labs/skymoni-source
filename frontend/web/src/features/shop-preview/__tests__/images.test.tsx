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

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { ProductEditor } from '../components/product-editor'
import { ProductImages } from '../components/product-images'
import { createShopData } from '../lib/data'

const first = `/api/shop/images/${'a'.repeat(64)}.jpg`
const second = `/api/shop/images/${'b'.repeat(64)}.jpg`

test('portrait mode fills image width with automatic height and retains enlargement', async () => {
  const user = userEvent.setup()
  const view = render(
    <ProductImages
      enabled
      images={[first, second]}
      name='Mail'
      imageLayout='portrait'
    />
  )
  const image = screen.getByRole('img', { name: 'Mail screenshot 1' })
  expect(image).toHaveClass('w-full', 'h-auto')
  expect(screen.getByRole('button', { name: 'View image 1' })).toHaveClass(
    'h-auto'
  )
  expect(image).not.toHaveClass('h-full', 'object-cover')
  await user.click(screen.getByRole('button', { name: 'View image 1' }))
  expect(
    within(screen.getByRole('dialog')).getByRole('img', { name: 'Mail' })
  ).toHaveAttribute('src', first)
  view.unmount()
  render(
    <ProductImages
      enabled
      images={[first]}
      name='Mail'
      imageLayout='landscape'
    />
  )
  expect(screen.getByRole('button', { name: 'View image 1' })).toHaveClass(
    'h-48',
    'sm:h-64'
  )
  expect(screen.getByRole('img')).toHaveClass('object-contain')
})

test('administrator selects one of two image layouts and saves it without changing images', async () => {
  const user = userEvent.setup()
  const save = vi.fn()
  render(
    <ProductEditor
      product={{
        ...createShopData().products[0],
        imagesEnabled: true,
        images: [first, second],
      }}
      onClose={() => {}}
      onSave={save}
    />
  )
  await user.click(screen.getByRole('tab', { name: 'Display content' }))
  const layout = screen.getByRole('combobox', { name: 'Image display mode' })
  expect(within(layout).getAllByRole('option')).toHaveLength(2)
  expect(layout).toHaveValue('landscape')
  await user.selectOptions(layout, 'portrait')
  expect(screen.getByRole('img', { name: /screenshot 1$/ })).toHaveClass(
    'h-auto'
  )
  await user.click(screen.getByRole('button', { name: 'Save product' }))
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        imageLayout: 'portrait',
        images: [first, second],
      })
    )
  )
})

const originalAnimations = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'getAnimations'
)

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 800, height: 600, close: () => {} }))
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: () => {},
    drawImage: () => {},
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (callback) => callback(new Blob(['prepared-image'], { type: 'image/jpeg' }))
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  if (originalAnimations) {
    Object.defineProperty(
      HTMLElement.prototype,
      'getAnimations',
      originalAnimations
    )
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
  }
})

test('disabled or empty galleries do not occupy product detail space', () => {
  const view = render(
    <ProductImages enabled={false} images={[first]} name='Muse' />
  )
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  view.rerender(<ProductImages enabled images={[]} name='Muse' />)
  expect(
    screen.queryByRole('heading', { name: 'Product screenshots' })
  ).not.toBeInTheDocument()
})

test('enabled images stay in a horizontal row and open an accessible large preview', async () => {
  const user = userEvent.setup()
  render(<ProductImages enabled images={[first, second]} name='Muse' />)
  const gallery = screen.getByRole('region', { name: 'Product screenshots' })
  expect(within(gallery).getAllByRole('img')).toHaveLength(2)
  expect(gallery.querySelector('[data-slot="carousel-content"]')).toHaveClass(
    'overflow-hidden'
  )
  expect(
    within(gallery).getByRole('button', { name: 'Previous image' })
  ).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'View image 2' }))
  expect(
    within(screen.getByRole('dialog')).getByRole('img', { name: 'Muse' })
  ).toHaveAttribute('src', second)
  expect(screen.queryByText(second)).not.toBeInTheDocument()
})

test('turning off images preserves them when the administrator saves', async () => {
  const user = userEvent.setup()
  const save = vi.fn()
  render(
    <ProductEditor
      product={{
        ...createShopData().products[0],
        imagesEnabled: true,
        images: [first, second],
      }}
      onClose={() => {}}
      onSave={save}
    />
  )
  await user.click(screen.getByRole('tab', { name: 'Display content' }))
  await user.click(screen.getByRole('switch', { name: 'Show product images' }))
  expect(
    screen.queryByLabelText('Choose product images')
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Save product' }))
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ imagesEnabled: false, images: [first, second] })
    )
  )
})

test('the administrator can reorder and remove images before saving', async () => {
  const user = userEvent.setup()
  const save = vi.fn()
  render(
    <ProductEditor
      product={{
        ...createShopData().products[0],
        imagesEnabled: true,
        images: [first, second],
      }}
      onClose={() => {}}
      onSave={save}
    />
  )
  await user.click(screen.getByRole('tab', { name: 'Display content' }))
  expect(
    screen.getByRole('button', { name: 'Move image 1 earlier' })
  ).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Move image 2 earlier' }))
  expect(screen.getByRole('img', { name: 'Product image 1' })).toHaveAttribute(
    'src',
    second
  )
  await user.click(screen.getByRole('button', { name: 'Remove image 2' }))
  await user.click(screen.getByRole('button', { name: 'Save product' }))
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ images: [second] })
    )
  )
})

test('pasting a copied image uploads it and saves the persistent URL', async () => {
  const user = userEvent.setup()
  const save = vi.fn()
  const upload = vi.fn(async () => first)
  render(
    <ProductEditor
      live
      onUploadImage={upload}
      product={{ ...createShopData().products[0], imagesEnabled: true }}
      onClose={() => {}}
      onSave={save}
    />
  )
  await user.click(screen.getByRole('tab', { name: 'Display content' }))
  fireEvent.paste(
    screen.getByRole('group', { name: 'Paste product images here' }),
    {
      clipboardData: {
        files: [new File(['copied'], 'copied.png', { type: 'image/png' })],
      },
    }
  )
  expect(
    await screen.findByRole('img', { name: 'Product image 1' })
  ).toHaveAttribute('src', first)
  expect(upload).toHaveBeenCalledWith(expect.any(File), expect.any(AbortSignal))
  await user.click(screen.getByRole('button', { name: 'Save product' }))
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ imagesEnabled: true, images: [first] })
    )
  )
})

test.each(['markdown', 'html'] as const)(
  'uploading an instruction image inserts it in %s and preserves the product gallery',
  async (format) => {
    const user = userEvent.setup()
    const save = vi.fn()
    const product = createShopData().products[0]
    render(
      <ProductEditor
        live
        product={{
          ...product,
          benefit: { ...product.benefit, format, instructions: 'Guide' },
        }}
        onUploadImage={async () => first}
        onSave={save}
        onClose={vi.fn()}
      />
    )
    await user.click(screen.getByRole('tab', { name: 'Delivery content' }))
    await user.upload(
      screen.getByLabelText('Upload instruction image'),
      new File(['image'], 'guide.png', { type: 'image/png' })
    )
    expect(
      await screen.findByRole('img', { name: 'Instruction image' })
    ).toHaveAttribute('src', first)
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    const saved = save.mock.calls[0][0]
    expect(saved.benefit.instructions).toBe(
      format === 'html'
        ? `Guide\n\n<img src="${first}" alt="Instruction image">\n`
        : `Guide\n\n![Instruction image](${first})\n`
    )
    expect(saved.images).toEqual(product.images || [])
  }
)

test('pasting an instruction image inserts it at the cursor without losing surrounding text', async () => {
  const user = userEvent.setup()
  const product = createShopData().products[0]
  render(
    <ProductEditor
      live
      product={{
        ...product,
        benefit: { ...product.benefit, instructions: 'BeforeAfter' },
      }}
      onUploadImage={async () => first}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />
  )
  await user.click(screen.getByRole('tab', { name: 'Delivery content' }))
  const input = screen.getByRole('textbox', {
    name: 'Instructions after purchase',
  }) as HTMLTextAreaElement
  input.setSelectionRange(6, 6)
  fireEvent.paste(input, {
    clipboardData: {
      files: [new File(['image'], 'guide.webp', { type: 'image/webp' })],
    },
  })
  expect(
    await screen.findByRole('img', { name: 'Instruction image' })
  ).toHaveAttribute('src', first)
  expect(input).toHaveValue(`Before\n\n![Instruction image](${first})\nAfter`)
})

test('a failed instruction image upload keeps the instructions and releases the save button', async () => {
  const user = userEvent.setup()
  const product = createShopData().products[0]
  const save = vi.fn()
  const original = 'Keep this guide'
  render(
    <ProductEditor
      live
      product={{
        ...product,
        benefit: { ...product.benefit, instructions: original },
      }}
      onUploadImage={async () => {
        throw new Error('offline')
      }}
      onSave={save}
      onClose={vi.fn()}
    />
  )
  await user.click(screen.getByRole('tab', { name: 'Delivery content' }))
  await user.upload(
    screen.getByLabelText('Upload instruction image'),
    new File(['image'], 'guide.png', { type: 'image/png' })
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Image upload failed'
  )
  expect(
    screen.getByRole('textbox', { name: 'Instructions after purchase' })
  ).toHaveValue(original)
  await user.click(screen.getByRole('button', { name: 'Save product' }))
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        benefit: expect.objectContaining({ instructions: original }),
      })
    )
  )
})

test('failed upload keeps the existing image and re-enables save', async () => {
  const user = userEvent.setup()
  const upload = vi.fn(async () => {
    throw new Error('Network unavailable')
  })
  render(
    <ProductEditor
      live
      onUploadImage={upload}
      product={{
        ...createShopData().products[0],
        imagesEnabled: true,
        images: [first],
      }}
      onClose={() => {}}
      onSave={() => {}}
    />
  )
  await user.click(screen.getByRole('tab', { name: 'Display content' }))
  await user.upload(
    screen.getByLabelText('Choose product images'),
    new File(['copied'], 'image.png', { type: 'image/png' })
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your existing images were kept'
  )
  expect(screen.getByRole('img', { name: 'Product image 1' })).toHaveAttribute(
    'src',
    first
  )
  expect(screen.getByRole('button', { name: 'Save product' })).toBeEnabled()
})

test('pasting above the twelve-image limit is rejected before upload', async () => {
  const user = userEvent.setup()
  const upload = vi.fn()
  render(
    <ProductEditor
      live
      onUploadImage={upload}
      product={{
        ...createShopData().products[0],
        imagesEnabled: true,
        images: Array.from(
          { length: 12 },
          (_, index) => `/api/shop/images/${index.toString(16).repeat(64)}.jpg`
        ),
      }}
      onClose={() => {}}
      onSave={() => {}}
    />
  )
  await user.click(screen.getByRole('tab', { name: 'Display content' }))
  fireEvent.paste(
    screen.getByRole('group', { name: 'Paste product images here' }),
    {
      clipboardData: {
        files: [new File(['copied'], 'copied.png', { type: 'image/png' })],
      },
    }
  )
  expect(screen.getByRole('alert')).toHaveTextContent('Up to 12 images')
  expect(upload).not.toHaveBeenCalled()
})

test('uploading a cover saves the same persistent image in the gallery', async () => {
  const user = userEvent.setup()
  const save = vi.fn()
  const upload = vi.fn(async () => second)
  render(
    <ProductEditor
      live
      product={{ ...createShopData().products[0], images: [first] }}
      onClose={() => {}}
      onSave={save}
      onUploadImage={upload}
    />
  )
  await user.upload(
    screen.getByLabelText('Choose cover image'),
    new File(['image'], 'cover.png', { type: 'image/png' })
  )
  expect(
    await screen.findByRole('img', { name: 'Cover preview' })
  ).toHaveAttribute('src', second)
  await user.click(screen.getByRole('tab', { name: 'Display content' }))
  await user.click(screen.getByRole('switch', { name: 'Show product images' }))
  expect(
    screen.getByRole('button', { name: 'Set image 2 as cover' })
  ).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: 'Save product' }))
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ coverUrl: second, images: [first, second] })
    )
  )
})

test('choosing a gallery cover updates Basic information without another upload', async () => {
  const user = userEvent.setup()
  const upload = vi.fn()
  render(
    <ProductEditor
      live
      product={{
        ...createShopData().products[0],
        coverUrl: first,
        imagesEnabled: true,
        images: [first, second],
      }}
      onClose={() => {}}
      onSave={() => {}}
      onUploadImage={upload}
    />
  )
  await user.click(screen.getByRole('tab', { name: 'Display content' }))
  await user.click(screen.getByRole('button', { name: 'Set image 2 as cover' }))
  await user.click(screen.getByRole('tab', { name: 'Basic information' }))
  expect(screen.getByRole('img', { name: 'Cover preview' })).toHaveAttribute(
    'src',
    second
  )
  expect(screen.getByLabelText('Cover image URL')).toHaveValue(second)
  expect(upload).not.toHaveBeenCalled()
})

test('failed cover replacement keeps the current cover and gallery', async () => {
  const user = userEvent.setup()
  const save = vi.fn()
  render(
    <ProductEditor
      live
      product={{
        ...createShopData().products[0],
        coverUrl: first,
        images: [first],
      }}
      onClose={() => {}}
      onSave={save}
      onUploadImage={async () => {
        throw new Error('Network unavailable')
      }}
    />
  )
  await user.upload(
    screen.getByLabelText('Choose cover image'),
    new File(['image'], 'cover.png', { type: 'image/png' })
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your existing images were kept'
  )
  expect(screen.getByRole('img', { name: 'Cover preview' })).toHaveAttribute(
    'src',
    first
  )
  await user.click(screen.getByRole('button', { name: 'Save product' }))
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ coverUrl: first, images: [first] })
    )
  )
})

test('pasting a cover prevents saving until upload completes', async () => {
  const user = userEvent.setup()
  let complete!: (url: string) => void
  render(
    <ProductEditor
      live
      product={createShopData().products[0]}
      onClose={() => {}}
      onSave={() => {}}
      onUploadImage={() =>
        new Promise<string>((resolve) => {
          complete = resolve
        })
      }
    />
  )
  fireEvent.paste(
    screen.getByRole('group', { name: 'Paste a cover image here' }),
    {
      clipboardData: {
        files: [new File(['image'], 'cover.png', { type: 'image/png' })],
      },
    }
  )
  expect(screen.getByRole('button', { name: 'Save product' })).toBeDisabled()
  await waitFor(() => expect(complete).toBeTypeOf('function'))
  complete(first)
  expect(
    await screen.findByRole('img', { name: 'Cover preview' })
  ).toHaveAttribute('src', first)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save product' })).toBeEnabled()
  )
  await user.click(screen.getByRole('button', { name: 'Remove cover' }))
  expect(
    screen.queryByRole('img', { name: 'Cover preview' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Use image 1 as cover' })
  ).toBeEnabled()
})

test('removing the selected gallery image clears its cover but keeps other images', async () => {
  const user = userEvent.setup()
  const save = vi.fn()
  render(
    <ProductEditor
      live
      product={{
        ...createShopData().products[0],
        coverUrl: first,
        imagesEnabled: true,
        images: [first, second],
      }}
      onClose={() => {}}
      onSave={save}
    />
  )
  await user.click(screen.getByRole('tab', { name: 'Display content' }))
  await user.click(screen.getByRole('button', { name: 'Remove image 1' }))
  await user.click(screen.getByRole('button', { name: 'Save product' }))
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ coverUrl: '', images: [second] })
    )
  )
})

test('at the twelve-image limit an existing image can still be selected as cover', async () => {
  const user = userEvent.setup()
  const images = Array.from(
    { length: 12 },
    (_, i) => `/api/shop/images/${i.toString(16).repeat(64)}.jpg`
  )
  render(
    <ProductEditor
      live
      product={{ ...createShopData().products[0], images }}
      onClose={() => {}}
      onSave={() => {}}
    />
  )
  expect(screen.getByLabelText('Choose cover image')).toBeDisabled()
  await user.click(
    screen.getByRole('button', { name: 'Use image 12 as cover' })
  )
  expect(screen.getByRole('img', { name: 'Cover preview' })).toHaveAttribute(
    'src',
    images[11]
  )
})
