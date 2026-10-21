export type PortalGalleryItem = { image: string; title: string; author: string }
export type GalleryMotion = { amplitude: number; speed: number }
export class PortalGalleryRenderer {
  constructor(
    container: HTMLElement,
    items: PortalGalleryItem[],
    onReady: () => void,
    onError: () => void
  )
  resize(): void
  setMotion(settings: GalleryMotion): void
  setTheme(): void
  frame(position: number, moving: boolean, motion: boolean): void
  destroy(): void
}
