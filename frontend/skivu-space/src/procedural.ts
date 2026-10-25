import * as T from "three";
export function seeded(seed = 1826) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function canvasTexture(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  paint(ctx);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
export function metalTexture() {
  return canvasTexture(256, 256, (c) => {
    c.fillStyle = "#c6ccd3";
    c.fillRect(0, 0, 256, 256);
    const r = seeded();
    for (let i = 0; i < 2200; i++) {
      c.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "20,30,50"},${r() * 0.09})`;
      c.fillRect(r() * 256, r() * 256, 1 + r() * 20, 1);
    }
    c.strokeStyle = "#6a77843b";
    c.lineWidth = 1;
    for (let x = 0; x < 256; x += 32) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 256);
      c.stroke();
    }
  });
}
export function solarTexture(blue = false) {
  return canvasTexture(256, 512, (c) => {
    c.fillStyle = blue ? "#1d3b69" : "#44331c";
    c.fillRect(0, 0, 256, 512);
    for (let x = 3; x < 256; x += 16)
      for (let y = 3; y < 512; y += 12) {
        c.fillStyle = blue
          ? `hsl(216 45% ${24 + ((x + y) % 11)}%)`
          : `hsl(32 48% ${25 + ((x + y) % 12)}%)`;
        c.fillRect(x, y, 14, 10);
      }
    c.strokeStyle = blue ? "#7397bc" : "#bcaa7b";
    c.lineWidth = 0.7;
    for (let x = 0; x <= 256; x += 32) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 512);
      c.stroke();
    }
    c.strokeStyle = "#d5d9cda0";
    for (let y = 0; y <= 512; y += 64) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(256, y);
      c.stroke();
    }
  });
}
export function labelTexture(text: string, color = "#28394d") {
  return canvasTexture(512, 128, (c) => {
    c.clearRect(0, 0, 512, 128);
    c.fillStyle = "#e8e9e3";
    c.fillRect(0, 0, 512, 128);
    c.fillStyle = color;
    c.font = "bold 56px system-ui";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, 256, 68);
  });
}
export function earthTextures() {
  const coast: number[][][] = [
    [
      [-168, 70],
      [-142, 68],
      [-125, 53],
      [-124, 40],
      [-113, 29],
      [-100, 18],
      [-88, 17],
      [-80, 25],
      [-79, 34],
      [-63, 45],
      [-52, 53],
      [-65, 61],
      [-83, 69],
      [-114, 73],
    ],
    [
      [-81, 12],
      [-69, 9],
      [-51, 3],
      [-35, -6],
      [-44, -24],
      [-56, -39],
      [-67, -56],
      [-74, -41],
      [-78, -15],
    ],
    [
      [-17, 36],
      [5, 37],
      [15, 32],
      [33, 31],
      [43, 12],
      [51, 11],
      [44, -13],
      [34, -27],
      [18, -35],
      [10, -21],
      [1, 2],
      [-15, 14],
    ],
    [
      [-10, 36],
      [-10, 58],
      [5, 62],
      [23, 70],
      [58, 71],
      [88, 75],
      [125, 65],
      [165, 65],
      [179, 54],
      [143, 44],
      [127, 34],
      [121, 18],
      [108, 8],
      [104, -5],
      [96, 10],
      [80, 9],
      [72, 23],
      [55, 29],
      [35, 41],
      [20, 36],
    ],
    [
      [112, -11],
      [133, -12],
      [151, -22],
      [153, -38],
      [137, -40],
      [115, -29],
    ],
    [
      [-52, 60],
      [-43, 60],
      [-22, 73],
      [-35, 84],
      [-56, 80],
      [-63, 67],
    ],
    [
      [47, -13],
      [50, -15],
      [49, -26],
      [44, -24],
    ],
    [
      [166, -35],
      [177, -38],
      [172, -46],
      [166, -45],
    ],
  ];
  const surface = canvasTexture(2048, 1024, (c) => {
    c.fillStyle = "#164769";
    c.fillRect(0, 0, 2048, 1024);
    const grad = c.createLinearGradient(0, 0, 0, 1024);
    grad.addColorStop(0, "#b3d2d4");
    grad.addColorStop(0.2, "#1a4e72");
    grad.addColorStop(0.55, "#124366");
    grad.addColorStop(0.85, "#143b59");
    grad.addColorStop(1, "#c2d8dd");
    c.fillStyle = grad;
    c.fillRect(0, 0, 2048, 1024);
    const pt = (p: number[]) => [((p[0] + 180) / 360) * 2048, ((90 - p[1]) / 180) * 1024];
    for (const poly of coast) {
      c.beginPath();
      poly.forEach((p, i) => {
        const [x, y] = pt(p);
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      });
      c.closePath();
      c.fillStyle = "#54745d";
      c.fill();
      c.save();
      c.clip();
      const r = seeded(47);
      for (let i = 0; i < 7500; i++) {
        c.fillStyle = `rgba(${r() > 0.4 ? "178,153,98" : "12,69,54"},${r() * 0.2})`;
        c.fillRect(r() * 2048, r() * 1024, 4 + r() * 22, 2 + r() * 10);
      }
      c.restore();
    }
    c.fillStyle = "#d7e9e9";
    c.beginPath();
    c.moveTo(0, 970);
    for (let x = 0; x <= 2048; x += 20)
      c.lineTo(x, 966 + Math.sin(x * 0.013) * 15 + Math.cos(x * 0.029) * 9);
    c.lineTo(2048, 1024);
    c.lineTo(0, 1024);
    c.fill();
    c.fillStyle = "#ebf1ee";
    c.fillRect(0, 0, 2048, 22);
  });
  const clouds = canvasTexture(2048, 1024, (c) => {
    const r = seeded(73);
    for (let i = 0; i < 4700; i++) {
      const x = r() * 2048,
        y = 80 + r() * 880,
        rx = 4 + r() * 32,
        ry = 1 + r() * 9;
      c.save();
      c.translate(x, y);
      c.rotate(Math.sin(y * 0.013) * 0.9);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, `rgba(246,251,255,${r() * 0.52})`);
      g.addColorStop(1, "rgba(246,251,255,0)");
      c.scale(1, ry / rx);
      c.fillStyle = g;
      c.fillRect(-rx, -rx, rx * 2, rx * 2);
      c.restore();
    }
  });
  return { surface, clouds };
}
export function makeStars(count = 1200) {
  const r = seeded(426);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = r() * Math.PI * 2,
      phi = Math.acos(2 * r() - 1),
      radius = 18000;
    positions.set(
      [
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta),
      ],
      i * 3,
    );
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.BufferAttribute(positions, 3));
  return new T.Points(
    geometry,
    new T.PointsMaterial({
      color: 0xbcd4f0,
      size: 3,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.65,
    }),
  );
}
