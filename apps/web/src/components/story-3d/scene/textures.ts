import * as THREE from "three";

// Procedural textures, drawn once on a canvas from a fixed seed so every run of
// the page, and every take, looks the same.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function finish(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Rock in section: a base colour, grains, and faint bedding lines. */
export function rockTexture(base: string, grain: string[], seed: number, bedding = 0.18): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26; i++) {
    const y = r() * 512;
    g.fillStyle = `rgba(40,25,15,${bedding * (0.3 + 0.7 * r())})`;
    g.fillRect(0, y, 512, 1 + r() * 2.5);
    g.fillStyle = `rgba(255,245,230,${bedding * 0.5 * r()})`;
    g.fillRect(0, y + 3, 512, 1 + r() * 2);
  }
  for (let i = 0; i < 5200; i++) {
    g.fillStyle = grain[Math.floor(r() * grain.length)]!;
    g.globalAlpha = 0.25 + 0.6 * r();
    const s = 0.8 + r() * 2.4;
    g.fillRect(r() * 512, r() * 512, s, s * (0.6 + r() * 0.5));
  }
  g.globalAlpha = 1;
  return finish(c);
}

/** Desert surface: fine sand with soft wind ripples. */
export function sandTexture(seed = 7, ripple = 1): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  const r = rng(seed);
  g.fillStyle = "#e3c9a0";
  g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 90; i++) {
    const y = r() * 1024;
    g.strokeStyle = `rgba(150,105,60,${(0.05 + 0.07 * r()) * ripple})`;
    g.lineWidth = 2 + r() * 5;
    g.beginPath();
    for (let x = 0; x <= 1024; x += 16) g.lineTo(x, y + Math.sin(x / (60 + r() * 30) + i) * 7);
    g.stroke();
  }
  for (let i = 0; i < 16000; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? "rgba(120,85,50,0.35)" : "rgba(255,248,235,0.4)";
    const s = 0.7 + r() * 1.6;
    g.fillRect(r() * 1024, r() * 1024, s, s);
  }
  return finish(c);
}

/** Soft round dot for steam, oil drops and glows. */
export function dotTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.75)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return finish(c, false);
}

/** Bands along the flow column, scrolled to show crude rising or steam going down. */
export function bandTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 256);
  for (let y = 0; y < 256; y++) {
    const k = 0.5 + 0.5 * Math.sin((y / 256) * Math.PI * 2 * 3);
    const a = 0.35 + 0.65 * k * k;
    g.fillStyle = `rgba(255,255,255,${a})`;
    g.fillRect(0, y, 64, 1);
  }
  return finish(c);
}
