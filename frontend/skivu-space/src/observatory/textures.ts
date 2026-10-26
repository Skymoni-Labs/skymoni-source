import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Deterministic, dependency-free procedural texture generation       */
/* ------------------------------------------------------------------ */

type Rgb = [number, number, number];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
];

/** Fast deterministic PRNG used only for tiny surface imperfections. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash3 = (x: number, y: number, z: number): number => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
};

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Trilinear value noise; tuned for the low-frequency earth masks. */
function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);

  const n000 = hash3(xi, yi, zi);
  const n100 = hash3(xi + 1, yi, zi);
  const n010 = hash3(xi, yi + 1, zi);
  const n110 = hash3(xi + 1, yi + 1, zi);
  const n001 = hash3(xi, yi, zi + 1);
  const n101 = hash3(xi + 1, yi, zi + 1);
  const n011 = hash3(xi, yi + 1, zi + 1);
  const n111 = hash3(xi + 1, yi + 1, zi + 1);

  const nx00 = mix(n000, n100, u);
  const nx10 = mix(n010, n110, u);
  const nx01 = mix(n001, n101, u);
  const nx11 = mix(n011, n111, u);
  return mix(mix(nx00, nx10, v), mix(nx01, nx11, v), w);
}

function fbm3(x: number, y: number, z: number, octaves: number): number {
  let value = 0;
  let amplitude = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    value += amplitude * noise3(x, y, z);
    norm += amplitude;
    x = x * 2.03 + 13.7;
    y = y * 2.01 - 7.9;
    z = z * 1.97 + 4.3;
    amplitude *= 0.5;
  }
  return value / norm;
}

/**
 * Generates the Earth's albedo, roughness and cloud maps as equirectangular
 * textures. Everything is authored at runtime — no external image assets.
 */
export function createEarthTextures(quality: number, anisotropy: number) {
  const width = quality;
  const height = quality / 2;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = width;
  albedoCanvas.height = height;
  const albedoCtx = albedoCanvas.getContext('2d');
  if (!albedoCtx) throw new Error('2D canvas is unavailable.');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = width;
  roughCanvas.height = height;
  const roughCtx = roughCanvas.getContext('2d');
  if (!roughCtx) throw new Error('2D canvas is unavailable.');

  const cloudMaskCanvas = document.createElement('canvas');
  cloudMaskCanvas.width = width;
  cloudMaskCanvas.height = height;
  const cloudMaskCtx = cloudMaskCanvas.getContext('2d');
  if (!cloudMaskCtx) throw new Error('2D canvas is unavailable.');

  const albedo = albedoCtx.createImageData(width, height);
  const rough = roughCtx.createImageData(width, height);
  const cloudMask = cloudMaskCtx.createImageData(width, height);

  const deepOcean: Rgb = [8, 27, 60];
  const midOcean: Rgb = [18, 68, 112];
  const shallowOcean: Rgb = [42, 133, 164];
  const coastSand: Rgb = [137, 125, 87];
  const lowland: Rgb = [54, 98, 56];
  const rainforest: Rgb = [31, 77, 45];
  const dryland: Rgb = [137, 117, 72];
  const highland: Rgb = [117, 108, 90];
  const snow: Rgb = [224, 238, 243];

  for (let y = 0; y < height; y += 1) {
    const lat = (0.5 - (y + 0.5) / height) * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);

    for (let x = 0; x < width; x += 1) {
      const lon = ((x + 0.5) / width) * Math.PI * 2 - Math.PI;
      const px = Math.cos(lon) * cosLat;
      const py = sinLat;
      const pz = Math.sin(lon) * cosLat;

      // Domain-warped continental mask keeps the coastlines organic.
      const warp = fbm3(px * 2.2 + 8.1, py * 2.2 - 3.4, pz * 2.2 + 1.7, 3);
      const continental = fbm3(
        px * 1.55 + (warp - 0.5) * 0.75,
        py * 1.9 - 4.2,
        pz * 1.55 + (warp - 0.5) * 0.75,
        5,
      );
      const detail = fbm3(px * 5.1 - 9.0, py * 5.1 + 2.8, pz * 5.1 + 7.5, 4);
      const ridges = 1 - Math.abs(fbm3(px * 3.2 + 4.4, py * 3.2, pz * 3.2 - 3.3, 3) * 2 - 1);
      let elevation = continental * 0.76 + detail * 0.17 + ridges * 0.07;

      // Slightly more ocean in the southern hemisphere, like Earth.
      elevation += py * 0.015;
      const landMask = smoothstep(0.555, 0.585, elevation);
      const coastal = smoothstep(0.525, 0.575, elevation);

      const oceanColor = mixRgb(
        mixRgb(deepOcean, midOcean, smoothstep(0.37, 0.51, elevation)),
        shallowOcean,
        smoothstep(0.5, 0.585, elevation) * 0.8,
      );

      const climate = fbm3(px * 2.9 - 2.5, py * 3.5 + 12.0, pz * 2.9, 3);
      const latitudeDryness = 1 - smoothstep(0.02, 0.36, Math.abs(py));
      const dry = smoothstep(0.48, 0.7, climate + latitudeDryness * 0.2);
      const lush = smoothstep(0.55, 0.75, 1 - climate + Math.abs(py) * 0.1);

      let landColor = mixRgb(lowland, dryland, dry);
      landColor = mixRgb(landColor, rainforest, lush * 0.45);
      landColor = mixRgb(landColor, highland, smoothstep(0.63, 0.76, elevation));
      landColor = mixRgb(landColor, coastSand, smoothstep(0.555, 0.59, elevation) * 0.55);
      landColor = mixRgb(
        landColor,
        snow,
        smoothstep(0.73, 0.84, elevation + Math.abs(py) * 0.08) * 0.7,
      );

      let color = mixRgb(oceanColor, landColor, landMask);

      // Polar caps are irregular, not a flat white band.
      const iceNoise = fbm3(px * 4.7 + 3.1, py * 7.2, pz * 4.7 - 2.2, 3);
      const polar = smoothstep(0.79, 0.91, Math.abs(py) + (iceNoise - 0.5) * 0.17);
      color = mixRgb(color, snow, polar * 0.96);

      // Shallow shelf glow around coastlines.
      color = mixRgb(color, [42, 121, 146], (1 - landMask) * coastal * 0.24);

      // Layered, wind-banded cloud field with a subtle cyclone swirl.
      const swirlX = px * 1.8 + Math.sin(py * 8.0 + lon * 2.0) * 0.12;
      const swirlZ = pz * 1.8 + Math.cos(py * 7.0 - lon * 2.0) * 0.12;
      const baseCloud = fbm3(swirlX + 21.2, py * 3.4 - 5.8, swirlZ - 17.1, 5);
      const wisps = fbm3(px * 8.2 - 3.7, py * 11.5 + 8.1, pz * 8.2 + 9.4, 3);
      const bands = 0.06 * Math.sin(lat * 11.5 + climate * 4.0);
      const clouds = smoothstep(0.535, 0.685, baseCloud + wisps * 0.12 + bands);
      const storm = smoothstep(0.72, 0.88, baseCloud) * smoothstep(0.15, 0.5, Math.abs(py));
      const cloudAlpha = Math.round(255 * clamp01(clouds * 0.78 + storm * 0.22));

      // The cloud deck is baked into the albedo at low contrast. This keeps
      // cloud structure visible from the station while the separate animated
      // cloud shell adds parallax and drift.
      const bakedCloud = smoothstep(0.12, 0.8, cloudAlpha / 255) * 0.53;
      color = mixRgb(color, [230, 240, 245], bakedCloud);

      const i = (y * width + x) * 4;
      albedo.data[i] = color[0];
      albedo.data[i + 1] = color[1];
      albedo.data[i + 2] = color[2];
      albedo.data[i + 3] = 255;

      const roughnessValue = Math.round(
        255 * clamp01(0.74 + landMask * 0.16 - polar * 0.12 - (1 - landMask) * 0.22),
      );
      rough.data[i] = roughnessValue;
      rough.data[i + 1] = roughnessValue;
      rough.data[i + 2] = roughnessValue;
      rough.data[i + 3] = 255;

      cloudMask.data[i] = cloudAlpha;
      cloudMask.data[i + 1] = cloudAlpha;
      cloudMask.data[i + 2] = cloudAlpha;
      cloudMask.data[i + 3] = 255;
    }
  }

  albedoCtx.putImageData(albedo, 0, 0);
  roughCtx.putImageData(rough, 0, 0);
  cloudMaskCtx.putImageData(cloudMask, 0, 0);

  const makeTexture = (canvas: HTMLCanvasElement, srgb: boolean) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    return texture;
  };

  return {
    albedo: makeTexture(albedoCanvas, true),
    roughness: makeTexture(roughCanvas, false),
    cloudMask: makeTexture(cloudMaskCanvas, false),
  };
}

/* ------------------------------------------------------------------ */
/*  Spacecraft surface textures                                        */
/* ------------------------------------------------------------------ */

/** Dark-blue photovoltaic blankets with cell busbars and subtle wear. */
export function createSolarTexture(anisotropy: number): THREE.CanvasTexture {
  const width = 512;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable.');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0a1831');
  bg.addColorStop(0.4, '#102b55');
  bg.addColorStop(0.72, '#0a224a');
  bg.addColorStop(1, '#071426');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const rng = mulberry32(91_337);
  const cols = 10;
  const rows = 22;
  const gap = 3;
  const cellW = width / cols;
  const cellH = height / rows;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const tint = rng();
      const blue = 42 + Math.round(tint * 36);
      const green = 72 + Math.round(tint * 28);
      const red = 7 + Math.round(tint * 15);
      const x = col * cellW + gap;
      const y = row * cellH + gap;
      const w = cellW - gap * 2;
      const h = cellH - gap * 2;

      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, `rgba(${red + 15}, ${green + 14}, ${blue + 38}, 1)`);
      grad.addColorStop(0.55, `rgba(${red}, ${green}, ${blue}, 1)`);
      grad.addColorStop(1, `rgba(${red + 4}, ${green + 9}, ${blue + 20}, 1)`);
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);

      // Fine busbars inside each cell.
      ctx.strokeStyle = 'rgba(135, 190, 220, 0.22)';
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k += 1) {
        const bx = x + (w * k) / 4;
        ctx.beginPath();
        ctx.moveTo(bx, y + 2);
        ctx.lineTo(bx, y + h - 2);
        ctx.stroke();
      }

      if (rng() > 0.93) {
        ctx.fillStyle = 'rgba(120, 174, 205, 0.1)';
        ctx.fillRect(x, y, w, h);
      }
    }
  }

  // Wide silver collector strips.
  ctx.fillStyle = 'rgba(191, 208, 218, 0.74)';
  ctx.fillRect(width * 0.495, 0, 5, height);
  ctx.fillRect(width * 0.245, 0, 2, height);
  ctx.fillRect(width * 0.75, 0, 2, height);

  // Broad, soft reflection across the glass.
  const sheen = ctx.createLinearGradient(0, 0, width, height * 0.58);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.42, 'rgba(156,214,255,0.13)');
  sheen.addColorStop(0.52, 'rgba(255,255,255,0.22)');
  sheen.addColorStop(0.63, 'rgba(120,187,229,0.07)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);

  // Stencilled identification text.
  ctx.save();
  ctx.translate(width * 0.5, height * 0.972);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(205, 225, 238, 0.68)';
  ctx.font = '600 13px Bahnschrift, Segoe UI, sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText('ISS / SAW  4A', -60, 0);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** White ribbed radiator face with subtle panel joints. */
export function createRadiatorTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable.');
  const rng = mulberry32(41_011);

  ctx.fillStyle = '#d7d9d5';
  ctx.fillRect(0, 0, size, size);

  const grad = ctx.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.3)');
  grad.addColorStop(0.45, 'rgba(119,126,130,0.06)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.2)');
  grad.addColorStop(1, 'rgba(79,87,91,0.15)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 8) {
    ctx.fillStyle = y % 32 === 0 ? 'rgba(91,99,103,0.2)' : 'rgba(255,255,255,0.16)';
    ctx.fillRect(0, y, size, 1);
  }
  for (let x = 0; x < size; x += 64) {
    ctx.fillStyle = 'rgba(82,89,93,0.28)';
    ctx.fillRect(x, 0, 2, size);
  }
  for (let i = 0; i < 70; i += 1) {
    ctx.fillStyle = `rgba(72,78,81,${rng() * 0.05})`;
    ctx.fillRect(rng() * size, rng() * size, rng() * 32 + 4, rng() * 2 + 1);
  }

  ctx.fillStyle = 'rgba(49,57,61,0.7)';
  ctx.font = '600 16px Bahnschrift, Segoe UI, sans-serif';
  ctx.fillText('HEAT REJECTION', 26, size - 34);
  ctx.font = '12px Bahnschrift, Segoe UI, sans-serif';
  ctx.fillText('NH3 / PVTC', 26, size - 18);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** Dark metallic placard used to place readable module identities in 3D. */
export function createDecalTexture(
  title: string,
  subtitle: string,
  accent: string,
  anisotropy: number,
  align: 'left' | 'center' = 'left',
): THREE.CanvasTexture {
  const width = 1024;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable.');

  const plate = ctx.createLinearGradient(0, 0, width, height);
  plate.addColorStop(0, 'rgba(9,15,21,0.94)');
  plate.addColorStop(0.7, 'rgba(17,25,32,0.9)');
  plate.addColorStop(1, 'rgba(9,14,19,0.82)');
  ctx.fillStyle = plate;
  ctx.fillRect(10, 18, width - 20, height - 36);

  ctx.strokeStyle = 'rgba(164,188,200,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 18, width - 20, height - 36);

  ctx.fillStyle = accent;
  ctx.fillRect(10, 18, 14, height - 36);
  ctx.fillRect(34, height - 45, 160, 5);
  ctx.fillRect(width - 210, height - 45, 176, 5);

  ctx.textAlign = align;
  const x = align === 'center' ? width / 2 : 60;
  ctx.fillStyle = '#f1f6f8';
  ctx.font = '700 78px Bahnschrift, Segoe UI, Microsoft YaHei, sans-serif';
  ctx.fillText(title, x, 130);

  ctx.fillStyle = 'rgba(185, 204, 213, 0.88)';
  ctx.font = '500 28px Bahnschrift, Segoe UI, Microsoft YaHei, sans-serif';
  ctx.letterSpacing = '5px';
  ctx.fillText(subtitle, x, 182);

  ctx.fillStyle = accent;
  ctx.fillRect(width - 118, 56, 62, 7);
  ctx.fillStyle = 'rgba(236,246,250,0.75)';
  ctx.font = '600 20px Bahnschrift, Segoe UI, sans-serif';
  ctx.fillText('ISS', width - 118, 46);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** Soft star point with a cyan-white halo. */
export function createStarTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable.');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(234,247,255,0.95)');
  gradient.addColorStop(0.5, 'rgba(171,211,255,0.32)');
  gradient.addColorStop(1, 'rgba(120,180,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A tiny warning-stripe texture for greebles and truss equipment. */
export function createHazardTexture(anisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable.');
  ctx.fillStyle = '#d4b047';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#15181b';
  for (let x = -64; x < 320; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.lineTo(x + 24, 64);
    ctx.lineTo(x + 88, 0);
    ctx.lineTo(x + 64, 0);
    ctx.closePath();
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
