/** Browser settings only. The published viewer is static and needs no Node server. */
export function sceneRuntime() {
  const query = new URLSearchParams(location.search);
  const embedded = window.parent !== window;
  const productTour = embedded && query.get('tour') === 'skivu';
  const coarse = matchMedia('(pointer: coarse)').matches;
  const limitedCPU = navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4;
  const compactWidth = productTour ? 560 : 900;
  const lowQuality = query.get('quality') === 'low' || coarse || innerWidth <= compactWidth || limitedCPU;
  return {
    embedded, productTour, coarse, lowQuality,
    antialias: !lowQuality,
    shadows: !lowQuality && !productTour,
    framesPerSecond: lowQuality ? 24 : 30,
    pixelRatio: () => Math.min(devicePixelRatio || 1, coarse || innerWidth <= compactWidth || lowQuality ? 1 : productTour ? 1.25 : 1.6),
  };
}

export const productTourChapters: Record<string, { module: string; name: string }> = {
  overview: { module: 'overview', name: '基地总览' },
  conversation: { module: 'destiny', name: '对话中枢' },
  characters: { module: 'kibo', name: '角色舱' },
  appearance: { module: 'cupola', name: '光影舱' },
  ecosystem: { module: 'canadarm', name: '拓展坞' },
};
