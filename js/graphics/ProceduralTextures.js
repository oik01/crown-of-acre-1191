import * as THREE from '../vendor/three.module.js';

const textureCache = new Map();
const materialCache = new Map();

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toTexture(canvas, repeatX = 1, repeatY = 1, isSRGB = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  if (isSRGB) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Non-grid-aligned 2D value/gradient noise for organic terrain splatting
function hash2(x, y) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

function valueNoise2D(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3.0 - 2.0 * fx);
  const v = fy * fy * (3.0 - 2.0 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm2D(x, y) {
  let v = 0;
  let amp = 0.5;
  let px = x;
  let py = y;
  // Rotate octaves by 37 degrees to prevent any axis-aligned or checkerboard artifacts
  const cosA = 0.8;
  const sinA = 0.6;
  for (let i = 0; i < 4; i++) {
    v += amp * valueNoise2D(px, py);
    const nx = (cosA * px - sinA * py) * 2.03 + 17.3;
    const ny = (sinA * px + cosA * py) * 2.03 + 31.7;
    px = nx;
    py = ny;
    amp *= 0.5;
  }
  return v;
}

/**
 * Generates interlocking 4-in-1 medieval chainmail albedo & bump textures.
 */
export function getChainmailTextures() {
  if (textureCache.has('chainmail')) return textureCache.get('chainmail');
  const size = 256;
  const colorCanvas = createCanvas(size, size);
  const bumpCanvas = createCanvas(size, size);
  const cCtx = colorCanvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');

  cCtx.fillStyle = '#1d2126';
  cCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#101010';
  bCtx.fillRect(0, 0, size, size);

  const rows = 16;
  const cols = 16;
  const cellW = size / cols;
  const cellH = size / rows;
  const ringR = cellW * 0.44;

  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      const cx = (c + (r % 2 === 0 ? 0.5 : 0)) * cellW;
      const cy = r * cellH * 0.85;

      bCtx.save();
      bCtx.translate(cx, cy);
      bCtx.rotate((r % 2 === 0 ? 1 : -1) * 0.22);
      bCtx.strokeStyle = '#e8e8e8';
      bCtx.lineWidth = cellW * 0.22;
      bCtx.beginPath();
      bCtx.arc(0, 0, ringR, 0, Math.PI * 2);
      bCtx.stroke();
      bCtx.restore();

      cCtx.save();
      cCtx.translate(cx, cy);
      cCtx.rotate((r % 2 === 0 ? 1 : -1) * 0.22);
      cCtx.strokeStyle = '#7c8591';
      cCtx.lineWidth = cellW * 0.22;
      cCtx.beginPath();
      cCtx.arc(0, 0, ringR, 0, Math.PI * 2);
      cCtx.stroke();

      cCtx.strokeStyle = '#b8c2ce';
      cCtx.lineWidth = cellW * 0.09;
      cCtx.beginPath();
      cCtx.arc(0, 0, ringR, -Math.PI * 0.75, Math.PI * 0.15);
      cCtx.stroke();

      cCtx.fillStyle = '#dce4ee';
      cCtx.beginPath();
      cCtx.arc(ringR * 0.85, 0, cellW * 0.06, 0, Math.PI * 2);
      cCtx.fill();
      cCtx.restore();
    }
  }

  const result = {
    map: toTexture(colorCanvas, 3, 3, true),
    bumpMap: toTexture(bumpCanvas, 3, 3, false),
  };
  textureCache.set('chainmail', result);
  return result;
}

/**
 * Generates brushed & battle-scratched tempered steel with riveted trim.
 */
export function getTemperedSteelTextures() {
  if (textureCache.has('steel')) return textureCache.get('steel');
  const size = 256;
  const colorCanvas = createCanvas(size, size);
  const bumpCanvas = createCanvas(size, size);
  const roughCanvas = createCanvas(size, size);
  const cCtx = colorCanvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');
  const rCtx = roughCanvas.getContext('2d');
  const rand = seededRandom(101);

  const grad = cCtx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#a2abb8');
  grad.addColorStop(0.5, '#cad3df');
  grad.addColorStop(1, '#8c95a2');
  cCtx.fillStyle = grad;
  cCtx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#424242';
  rCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 450; i++) {
    const y = rand() * size;
    const len = 20 + rand() * 80;
    const x = rand() * size;
    const alpha = 0.04 + rand() * 0.08;
    cCtx.strokeStyle = rand() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(30,35,42,${alpha})`;
    cCtx.lineWidth = 1;
    cCtx.beginPath();
    cCtx.moveTo(x, y);
    cCtx.lineTo(x + len, y + (rand() - 0.5) * 3);
    cCtx.stroke();
  }

  for (let i = 0; i < 38; i++) {
    const x1 = rand() * size;
    const y1 = rand() * size;
    const angle = rand() * Math.PI;
    const len = 12 + rand() * 45;
    const x2 = x1 + Math.cos(angle) * len;
    const y2 = y1 + Math.sin(angle) * len;

    bCtx.strokeStyle = '#303030';
    bCtx.lineWidth = 1.5;
    bCtx.beginPath();
    bCtx.moveTo(x1, y1);
    bCtx.lineTo(x2, y2);
    bCtx.stroke();

    cCtx.strokeStyle = 'rgba(235, 242, 250, 0.35)';
    cCtx.lineWidth = 1;
    cCtx.beginPath();
    cCtx.moveTo(x1 + 1, y1 + 1);
    cCtx.lineTo(x2 + 1, y2 + 1);
    cCtx.stroke();

    rCtx.strokeStyle = '#a0a0a0';
    rCtx.lineWidth = 2;
    cCtx.beginPath();
    rCtx.moveTo(x1, y1);
    rCtx.lineTo(x2, y2);
    rCtx.stroke();
  }

  cCtx.strokeStyle = '#555d68';
  cCtx.lineWidth = 3;
  cCtx.strokeRect(4, 4, size - 8, size - 8);
  bCtx.strokeStyle = '#202020';
  bCtx.lineWidth = 4;
  bCtx.strokeRect(4, 4, size - 8, size - 8);

  for (let i = 16; i < size; i += 32) {
    for (const ry of [12, size - 12]) {
      cCtx.fillStyle = '#dde5ef';
      cCtx.beginPath();
      cCtx.arc(i, ry, 3.2, 0, Math.PI * 2);
      cCtx.fill();
      bCtx.fillStyle = '#ffffff';
      bCtx.beginPath();
      bCtx.arc(i, ry, 3.5, 0, Math.PI * 2);
      bCtx.fill();
    }
  }

  const result = {
    map: toTexture(colorCanvas, 1, 1, true),
    bumpMap: toTexture(bumpCanvas, 1, 1, false),
    roughnessMap: toTexture(roughCanvas, 1, 1, false),
  };
  textureCache.set('steel', result);
  return result;
}

/**
 * Generates woven medieval surcoat & heraldic cross textures.
 * Centered at u=0.5, v=0.45 so cylindrical tabard arc segments display the full emblem cleanly.
 */
export function getSurcoatTextures(variant = 'crusader_red') {
  const key = `surcoat_${variant}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const size = 512;
  const colorCanvas = createCanvas(size, size);
  const bumpCanvas = createCanvas(size, size);
  const cCtx = colorCanvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');
  const rand = seededRandom(variant.length * 97);

  let baseColor = '#eae0cc';
  let crossColor = '#a31818';
  let trimColor = '#cfa13c';
  if (variant === 'companion_gold') {
    baseColor = '#f2ead9';
    crossColor = '#961414';
    trimColor = '#e6b849';
  } else if (variant === 'hospitaller') {
    baseColor = '#22252a';
    crossColor = '#eee6d6';
    trimColor = '#b88f38';
  } else if (variant === 'saracen_royal') {
    baseColor = '#821818';
    crossColor = '#dfae42';
    trimColor = '#dfae42';
  } else if (variant === 'saracen_turquoise') {
    baseColor = '#16525e';
    crossColor = '#dba438';
    trimColor = '#dba438';
  }

  cCtx.fillStyle = baseColor;
  cCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#787878';
  bCtx.fillRect(0, 0, size, size);

  // Linen weave micro-grid
  for (let y = 0; y < size; y += 4) {
    bCtx.fillStyle = y % 8 === 0 ? '#969696' : '#646464';
    bCtx.fillRect(0, y, size, 2);
    cCtx.fillStyle = y % 8 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
    cCtx.fillRect(0, y, size, 2);
  }
  for (let x = 0; x < size; x += 4) {
    bCtx.fillStyle = x % 8 === 0 ? 'rgba(220,220,220,0.35)' : 'rgba(50,50,50,0.35)';
    bCtx.fillRect(x, 0, 2, size);
  }

  // Subtle vertical drapery folds
  for (let i = 0; i < 6; i++) {
    const fx = (i + 0.5) * (size / 6);
    const foldGrad = cCtx.createLinearGradient(fx - 32, 0, fx + 32, 0);
    foldGrad.addColorStop(0, 'rgba(0,0,0,0)');
    foldGrad.addColorStop(0.5, 'rgba(0,0,0,0.11)');
    foldGrad.addColorStop(1, 'rgba(255,255,255,0.06)');
    cCtx.fillStyle = foldGrad;
    cCtx.fillRect(fx - 32, 0, 64, size);

    const bGrad = bCtx.createLinearGradient(fx - 32, 0, fx + 32, 0);
    bGrad.addColorStop(0, '#707070');
    bGrad.addColorStop(0.5, '#b4b4b4');
    bGrad.addColorStop(1, '#707070');
    bCtx.fillStyle = bGrad;
    bCtx.fillRect(fx - 32, 0, 64, size);
  }

  if (variant.startsWith('saracen')) {
    // Ornate Saracen geometric sun/star medallion centered at (size/2, size*0.44)
    cCtx.fillStyle = trimColor;
    cCtx.fillRect(0, 14, size, 12);
    cCtx.fillRect(0, size - 28, size, 12);

    cCtx.save();
    cCtx.translate(size / 2, size * 0.44);
    cCtx.fillStyle = trimColor;
    for (let k = 0; k < 2; k++) {
      cCtx.save();
      cCtx.rotate((k * Math.PI) / 4);
      cCtx.fillRect(-68, -68, 136, 136);
      cCtx.restore();
    }
    cCtx.fillStyle = baseColor;
    cCtx.beginPath();
    cCtx.arc(0, 0, 44, 0, Math.PI * 2);
    cCtx.fill();
    cCtx.fillStyle = trimColor;
    cCtx.beginPath();
    cCtx.arc(0, 0, 30, 0, Math.PI * 2);
    cCtx.fill();
    cCtx.fillStyle = baseColor;
    cCtx.beginPath();
    cCtx.arc(9, -4, 24, 0, Math.PI * 2);
    cCtx.fill();
    cCtx.restore();
  } else {
    // Bold Crusader / Jerusalem Cross centered at (size/2, size*0.44)
    const cx = size / 2;
    const cy = size * 0.44;
    cCtx.fillStyle = crossColor;
    cCtx.strokeStyle = trimColor;
    cCtx.lineWidth = 6;

    // Vertical arm
    cCtx.fillRect(cx - 38, cy - 140, 76, 285);
    cCtx.strokeRect(cx - 38, cy - 140, 76, 285);
    // Horizontal arm
    cCtx.fillRect(cx - 125, cy - 38, 250, 76);
    cCtx.strokeRect(cx - 125, cy - 38, 250, 76);

    // Flared Cross Potent serifs
    cCtx.fillRect(cx - 60, cy - 144, 120, 26);
    cCtx.fillRect(cx - 60, cy + 124, 120, 26);
    cCtx.fillRect(cx - 130, cy - 60, 26, 120);
    cCtx.fillRect(cx + 104, cy - 60, 26, 120);

    if (variant === 'companion_gold') {
      cCtx.fillStyle = trimColor;
      const offsets = [
        [-74, -78],
        [74, -78],
        [-74, 78],
        [74, 78],
      ];
      for (const [ox, oy] of offsets) {
        cCtx.fillRect(cx + ox - 7, cy + oy - 24, 14, 48);
        cCtx.fillRect(cx + ox - 24, cy + oy - 7, 48, 14);
      }
    }

    bCtx.fillStyle = '#c8c8c8';
    bCtx.fillRect(cx - 38, cy - 140, 76, 285);
    bCtx.fillRect(cx - 125, cy - 38, 250, 76);
  }

  // Bottom hem gold trim & subtle mud weathering
  cCtx.fillStyle = trimColor;
  cCtx.fillRect(0, size - 28, size, 12);
  const mudGrad = cCtx.createLinearGradient(0, size - 75, 0, size);
  mudGrad.addColorStop(0, 'rgba(58, 44, 28, 0)');
  mudGrad.addColorStop(1, 'rgba(48, 36, 22, 0.48)');
  cCtx.fillStyle = mudGrad;
  cCtx.fillRect(0, size - 75, size, 75);

  for (let i = 0; i < 45; i++) {
    cCtx.fillStyle = `rgba(45, 33, 20, ${0.12 + rand() * 0.25})`;
    cCtx.beginPath();
    cCtx.arc(rand() * size, size - rand() * 60, 2 + rand() * 5, 0, Math.PI * 2);
    cCtx.fill();
  }

  const result = {
    map: toTexture(colorCanvas, 1, 1, true),
    bumpMap: toTexture(bumpCanvas, 1, 1, false),
  };
  textureCache.set(key, result);
  return result;
}

/**
 * Generates overlapping gilded bronze/steel lamellar scale armor for Saracen elite units.
 */
export function getLamellarTextures() {
  if (textureCache.has('lamellar')) return textureCache.get('lamellar');
  const size = 256;
  const colorCanvas = createCanvas(size, size);
  const bumpCanvas = createCanvas(size, size);
  const cCtx = colorCanvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');

  cCtx.fillStyle = '#5c1414';
  cCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#202020';
  bCtx.fillRect(0, 0, size, size);

  const rows = 10;
  const cols = 12;
  const w = size / cols;
  const h = size / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + (r % 2 === 0 ? 0 : 0.5)) * w;
      const y = r * h;

      const grad = cCtx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, '#d8aa48');
      grad.addColorStop(0.5, '#f2cc72');
      grad.addColorStop(1, '#8c6218');

      cCtx.fillStyle = grad;
      cCtx.strokeStyle = '#3b2408';
      cCtx.lineWidth = 1.5;

      cCtx.beginPath();
      cCtx.roundRect(x + 1, y + 1, w - 2, h + 3, [2, 2, 7, 7]);
      cCtx.fill();
      cCtx.stroke();

      cCtx.fillStyle = '#7a1818';
      cCtx.fillRect(x + w * 0.35, y + 3, w * 0.3, 3);

      bCtx.fillStyle = '#dcdcdc';
      bCtx.beginPath();
      bCtx.roundRect(x + 2, y + 2, w - 4, h + 1, [2, 2, 6, 6]);
      bCtx.fill();
    }
  }

  const result = {
    map: toTexture(colorCanvas, 2, 2, true),
    bumpMap: toTexture(bumpCanvas, 2, 2, false),
  };
  textureCache.set('lamellar', result);
  return result;
}

/**
 * Generates diamond-stitched quilted gambeson texture for infantry & crossbowmen.
 */
export function getGambesonTextures(baseHex = '#b9a582') {
  const key = `gambeson_${baseHex}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const size = 256;
  const colorCanvas = createCanvas(size, size);
  const bumpCanvas = createCanvas(size, size);
  const cCtx = colorCanvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');

  cCtx.fillStyle = baseHex;
  cCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#c8c8c8';
  bCtx.fillRect(0, 0, size, size);

  const step = 32;
  cCtx.strokeStyle = 'rgba(45, 32, 18, 0.45)';
  cCtx.lineWidth = 2.5;
  bCtx.strokeStyle = '#252525';
  bCtx.lineWidth = 4;

  for (let i = -size; i < size * 2; i += step) {
    cCtx.beginPath();
    cCtx.moveTo(i, 0);
    cCtx.lineTo(i + size, size);
    cCtx.stroke();
    bCtx.beginPath();
    bCtx.moveTo(i, 0);
    bCtx.lineTo(i + size, size);
    bCtx.stroke();

    cCtx.beginPath();
    cCtx.moveTo(i + size, 0);
    cCtx.lineTo(i, size);
    cCtx.stroke();
    bCtx.beginPath();
    bCtx.moveTo(i + size, 0);
    bCtx.lineTo(i, size);
    bCtx.stroke();
  }

  const result = {
    map: toTexture(colorCanvas, 2, 2, true),
    bumpMap: toTexture(bumpCanvas, 2, 2, false),
  };
  textureCache.set(key, result);
  return result;
}

/**
 * Generates detailed painted & battle-scarred shield textures.
 */
export function getShieldTextures(variant = 'crusader_heater') {
  const key = `shield_${variant}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const size = 512;
  const colorCanvas = createCanvas(size, size);
  const bumpCanvas = createCanvas(size, size);
  const cCtx = colorCanvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');
  const rand = seededRandom(variant.length * 53);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  if (variant === 'saracen_round') {
    const cx = size / 2;
    const cy = size / 2;
    const radGrad = cCtx.createRadialGradient(cx, cy, 20, cx, cy, size * 0.48);
    radGrad.addColorStop(0, '#e2b54c');
    radGrad.addColorStop(0.24, '#9c6e18');
    radGrad.addColorStop(0.26, '#821818');
    radGrad.addColorStop(0.75, '#540e0e');
    radGrad.addColorStop(0.88, '#cfa13c');
    radGrad.addColorStop(1, '#705214');
    cCtx.fillStyle = radGrad;
    cCtx.fillRect(0, 0, size, size);

    cCtx.save();
    cCtx.translate(cx, cy);
    cCtx.strokeStyle = '#ecc45e';
    cCtx.lineWidth = 6;
    for (let i = 0; i < 8; i++) {
      cCtx.save();
      cCtx.rotate((i * Math.PI) / 4);
      cCtx.strokeRect(-110, -110, 220, 220);
      cCtx.restore();
    }
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const rx = Math.cos(a) * 205;
      const ry = Math.sin(a) * 205;
      cCtx.fillStyle = '#f8df86';
      cCtx.beginPath();
      cCtx.arc(rx, ry, 7, 0, Math.PI * 2);
      cCtx.fill();
      bCtx.fillStyle = '#ffffff';
      bCtx.beginPath();
      bCtx.arc(cx + rx, cy + ry, 8, 0, Math.PI * 2);
      bCtx.fill();
    }
    cCtx.restore();
  } else {
    const isCompanion = variant === 'companion_heater';
    cCtx.fillStyle = isCompanion ? '#1a2f56' : '#ece2ce';
    cCtx.fillRect(0, 0, size, size);

    if (isCompanion) {
      cCtx.fillStyle = '#8e1818';
      cCtx.fillRect(size / 2, 0, size / 2, size / 2);
      cCtx.fillRect(0, size / 2, size / 2, size / 2);
    }

    const cx = size / 2;
    const cy = size * 0.45;
    cCtx.fillStyle = isCompanion ? '#ebbd4c' : '#a11919';
    cCtx.fillRect(cx - 44, 24, 88, size - 48);
    cCtx.fillRect(24, cy - 44, size - 48, 88);

    cCtx.strokeStyle = isCompanion ? '#e8be56' : '#858e9b';
    cCtx.lineWidth = 28;
    cCtx.strokeRect(14, 14, size - 28, size - 28);

    bCtx.strokeStyle = '#d8d8d8';
    bCtx.lineWidth = 28;
    bCtx.strokeRect(14, 14, size - 28, size - 28);

    for (let i = 0; i < 14; i++) {
      const x1 = 60 + rand() * (size - 120);
      const y1 = 60 + rand() * (size - 120);
      const x2 = x1 + (rand() - 0.5) * 110;
      const y2 = y1 + (rand() - 0.5) * 110;
      cCtx.strokeStyle = 'rgba(35, 28, 22, 0.55)';
      cCtx.lineWidth = 2.5;
      cCtx.beginPath();
      cCtx.moveTo(x1, y1);
      cCtx.lineTo(x2, y2);
      cCtx.stroke();

      bCtx.strokeStyle = '#202020';
      bCtx.lineWidth = 3;
      bCtx.beginPath();
      bCtx.moveTo(x1, y1);
      bCtx.lineTo(x2, y2);
      bCtx.stroke();
    }
  }

  const result = {
    map: toTexture(colorCanvas, 1, 1, true),
    bumpMap: toTexture(bumpCanvas, 1, 1, false),
  };
  textureCache.set(key, result);
  return result;
}

/**
 * Generates realistic equine coat texture (dapple grey, bay, black, chestnut)
 * with soft cloudy dapple blending (NO dark rings or bubble-wrap artifacts) and fine hair bump.
 */
export function getEquineCoatTextures(coatType = 'dapple_grey') {
  const key = `horse_${coatType}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const size = 256;
  const colorCanvas = createCanvas(size, size);
  const bumpCanvas = createCanvas(size, size);
  const cCtx = colorCanvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');
  const rand = seededRandom(coatType.length * 131);

  let base = '#9da5b0';
  let dark = '#767f8b';
  let highlight = '#d8dfe8';
  if (coatType === 'bay') {
    base = '#6b371c';
    dark = '#3b1c0c';
    highlight = '#8f4d2a';
  } else if (coatType === 'black') {
    base = '#1e2126';
    dark = '#0f1114';
    highlight = '#363b44';
  } else if (coatType === 'chestnut') {
    base = '#87431d';
    dark = '#54260d';
    highlight = '#ab5a2c';
  }

  // Smooth muscular shading gradient base
  const baseGrad = cCtx.createLinearGradient(0, 0, 0, size);
  baseGrad.addColorStop(0, highlight);
  baseGrad.addColorStop(0.45, base);
  baseGrad.addColorStop(1, dark);
  cCtx.fillStyle = baseGrad;
  cCtx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  if (coatType === 'dapple_grey') {
    // Soft, zero-ring cloudy dapple bloom patches (alpha fades to 0 at edge!)
    for (let i = 0; i < 120; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 8 + rand() * 18;
      const g = cCtx.createRadialGradient(x, y, 0, x, y, r);
      if (rand() > 0.35) {
        g.addColorStop(0, 'rgba(238, 243, 250, 0.24)');
        g.addColorStop(0.55, 'rgba(222, 229, 238, 0.12)');
        g.addColorStop(1, 'rgba(157, 165, 176, 0.0)');
      } else {
        g.addColorStop(0, 'rgba(105, 113, 125, 0.16)');
        g.addColorStop(0.6, 'rgba(120, 128, 140, 0.07)');
        g.addColorStop(1, 'rgba(157, 165, 176, 0.0)');
      }
      cCtx.fillStyle = g;
      cCtx.beginPath();
      cCtx.arc(x, y, r, 0, Math.PI * 2);
      cCtx.fill();
    }
  }

  // Fine directional equine hair streaks
  for (let i = 0; i < 650; i++) {
    const x = rand() * size;
    const y = rand() * size;
    cCtx.strokeStyle = rand() > 0.5 ? highlight : dark;
    cCtx.globalAlpha = 0.11;
    cCtx.lineWidth = 1;
    cCtx.beginPath();
    cCtx.moveTo(x, y);
    cCtx.lineTo(x + 9 + rand() * 12, y + (rand() - 0.5) * 1.5);
    cCtx.stroke();

    bCtx.strokeStyle = rand() > 0.5 ? '#9c9c9c' : '#646464';
    bCtx.lineWidth = 1;
    bCtx.beginPath();
    bCtx.moveTo(x, y);
    bCtx.lineTo(x + 9 + rand() * 12, y + (rand() - 0.5) * 1.5);
    bCtx.stroke();
  }
  cCtx.globalAlpha = 1;

  const result = {
    map: toTexture(colorCanvas, 1, 1, true),
    bumpMap: toTexture(bumpCanvas, 1, 1, false),
  };
  textureCache.set(key, result);
  return result;
}

/**
 * Generates weathered oak timber, pale sapwood stake tips, and masonry stone textures.
 */
export function getWoodAndLeatherTextures() {
  if (textureCache.has('wood_leather')) return textureCache.get('wood_leather');
  const size = 256;
  const woodCanvas = createCanvas(size, size);
  const weatheredCanvas = createCanvas(size, size);
  const woodBump = createCanvas(size, size);
  const wCtx = woodCanvas.getContext('2d');
  const wwCtx = weatheredCanvas.getContext('2d');
  const wbCtx = woodBump.getContext('2d');
  const rand = seededRandom(404);

  wCtx.fillStyle = '#5c3d22';
  wCtx.fillRect(0, 0, size, size);
  wwCtx.fillStyle = '#8b6c4c';
  wwCtx.fillRect(0, 0, size, size);
  wbCtx.fillStyle = '#808080';
  wbCtx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 3) {
    const isDark = rand() > 0.5;
    wCtx.fillStyle = isDark ? 'rgba(30, 18, 8, 0.24)' : 'rgba(130, 92, 54, 0.18)';
    wCtx.fillRect(0, y, size, 2);
    wwCtx.fillStyle = isDark ? 'rgba(55, 40, 24, 0.22)' : 'rgba(175, 142, 104, 0.20)';
    wwCtx.fillRect(0, y, size, 2);
    wbCtx.fillStyle = isDark ? '#505050' : '#b0b0b0';
    wbCtx.fillRect(0, y, size, 2);
  }
  for (let y = 0; y < size; y += 64) {
    wCtx.fillStyle = '#241509';
    wCtx.fillRect(0, y, size, 3);
    wwCtx.fillStyle = '#3d2b18';
    wwCtx.fillRect(0, y, size, 3);
    wbCtx.fillStyle = '#101010';
    wbCtx.fillRect(0, y, size, 4);
  }

  const stoneCanvas = createCanvas(size, size);
  const stoneBump = createCanvas(size, size);
  const sCtx = stoneCanvas.getContext('2d');
  const sbCtx = stoneBump.getContext('2d');

  sCtx.fillStyle = '#4a3d2f';
  sCtx.fillRect(0, 0, size, size);
  sbCtx.fillStyle = '#181818';
  sbCtx.fillRect(0, 0, size, size);

  const courseH = 32;
  for (let row = 0; row < size / courseH; row++) {
    const y = row * courseH;
    const cols = 4;
    const blockW = size / cols;
    const offset = (row % 2) * (blockW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * blockW + offset;
      const shade = 152 + Math.floor((rand() - 0.5) * 32);
      const r = shade + 12;
      const g = shade + 2;
      const b = shade - 18;
      sCtx.fillStyle = `rgb(${r},${g},${b})`;
      sCtx.beginPath();
      sCtx.roundRect(x + 2, y + 2, blockW - 4, courseH - 4, 3);
      sCtx.fill();

      // Stone surface pitting & chisel marks
      for (let k = 0; k < 12; k++) {
        const px = x + 5 + rand() * (blockW - 10);
        const py = y + 5 + rand() * (courseH - 10);
        sCtx.fillStyle = rand() > 0.5 ? 'rgba(255,248,230,0.16)' : 'rgba(40,30,20,0.18)';
        sCtx.fillRect(px, py, 3 + rand() * 5, 2 + rand() * 3);
      }

      sbCtx.fillStyle = '#d4d4d4';
      sbCtx.beginPath();
      sbCtx.roundRect(x + 3, y + 3, blockW - 6, courseH - 6, 3);
      sbCtx.fill();
    }
  }

  // Soil weathering along lower courses
  const soilGrad = sCtx.createLinearGradient(0, size * 0.55, 0, size);
  soilGrad.addColorStop(0, 'rgba(62, 46, 30, 0)');
  soilGrad.addColorStop(1, 'rgba(52, 38, 24, 0.55)');
  sCtx.fillStyle = soilGrad;
  sCtx.fillRect(0, size * 0.55, size, size * 0.45);

  const result = {
    woodMap: toTexture(woodCanvas, 2, 2, true),
    weatheredMap: toTexture(weatheredCanvas, 2, 2, true),
    woodBump: toTexture(woodBump, 2, 2, false),
    stoneMap: toTexture(stoneCanvas, 2, 2, true),
    stoneBump: toTexture(stoneBump, 2, 2, false),
  };
  textureCache.set('wood_leather', result);
  return result;
}

/**
 * Generates high-resolution organic multi-biome terrain splat texture (with continuous
 * FBM noise blending and organic caravan/wheel tracks) + tiled high-frequency ground bump map.
 */
export function getTerrainTextures(heightFn) {
  if (textureCache.has('terrain')) return textureCache.get('terrain');
  const size = 1024;
  const colorCanvas = createCanvas(size, size);
  const bumpCanvas = createCanvas(256, 256);
  const cCtx = colorCanvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');
  const rand = seededRandom(777);

  const imgData = cCtx.createImageData(size, size);
  const data = imgData.data;

  const worldSpan = 320;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const wx = (px / size - 0.5) * worldSpan;
      const wz = (py / size - 0.5) * worldSpan;
      const h = heightFn ? heightFn(wx, wz) : 0;

      // Estimate terrain slope for natural rocky cliff exposure
      const hx = heightFn ? heightFn(wx + 1.2, wz) - h : 0;
      const hz = heightFn ? heightFn(wx, wz + 1.2) - h : 0;
      const slope = Math.min(1, Math.hypot(hx, hz) * 1.15);

      const distCenter = Math.hypot(wx, wz * 0.82);

      // Rotated multi-octave FBM noise (zero grid / polka-dot artifacts!)
      const fbmMacro = fbm2D(wx * 0.032 + 11.4, wz * 0.032 + 23.8);
      const fbmDetail = fbm2D(wx * 0.14 - 7.2, wz * 0.14 + 19.1);
      const grain = (rand() - 0.5) * 14;

      // Base Biome 1: Golden-Ochre Levantine Sand & Dry Earth
      let r = 152 + (fbmMacro - 0.5) * 32 + (fbmDetail - 0.5) * 18;
      let g = 124 + (fbmMacro - 0.5) * 26 + (fbmDetail - 0.5) * 15;
      let b = 86 + (fbmMacro - 0.5) * 20 + (fbmDetail - 0.5) * 12;

      // Biome 2: Central Trampled Battle Mud & Hoofprint Churn
      const mudWeight =
        smoothstep(48, 14, distCenter + (fbmMacro - 0.5) * 18) * smoothstep(3.2, 0.8, h);
      const mudR = 84 + (fbmDetail - 0.5) * 22;
      const mudG = 64 + (fbmDetail - 0.5) * 18;
      const mudB = 44 + (fbmDetail - 0.5) * 14;
      r = r * (1 - mudWeight) + mudR * mudWeight;
      g = g * (1 - mudWeight) + mudG * mudWeight;
      b = b * (1 - mudWeight) + mudB * mudWeight;

      // Biome 3: Mediterranean Olive Scrub & Ridge Grass (smooth organic patches)
      const grassPatchNoise = fbmMacro * 0.65 + fbmDetail * 0.35;
      const grassElevWeight = smoothstep(0.9, 2.8, h + (fbmMacro - 0.5) * 1.4) * smoothstep(9.5, 4.8, h);
      const grassNoiseWeight = smoothstep(0.42, 0.68, grassPatchNoise);
      const grassWeight = Math.min(0.85, grassElevWeight * grassNoiseWeight * (1 - mudWeight * 0.8));
      const grassR = 92 + (fbmDetail - 0.5) * 24;
      const grassG = 106 + (fbmDetail - 0.5) * 28;
      const grassB = 58 + (fbmDetail - 0.5) * 16;
      r = r * (1 - grassWeight) + grassR * grassWeight;
      g = g * (1 - grassWeight) + grassG * grassWeight;
      b = b * (1 - grassWeight) + grassB * grassWeight;

      // Biome 4: Stratified Limestone Outcrops & Craggy Mountain Ridges
      const rockWeight = Math.max(
        smoothstep(0.28, 0.58, slope),
        smoothstep(5.2, 8.8, h + (fbmDetail - 0.5) * 1.8)
      );
      const strata = Math.sin(h * 3.8 + fbmDetail * 4.0) * 10;
      const rockR = 136 + strata + (fbmDetail - 0.5) * 20;
      const rockG = 124 + strata + (fbmDetail - 0.5) * 18;
      const rockB = 104 + strata * 0.8 + (fbmDetail - 0.5) * 16;
      r = r * (1 - rockWeight) + rockR * rockWeight;
      g = g * (1 - rockWeight) + rockG * rockWeight;
      b = b * (1 - rockWeight) + rockB * rockWeight;

      // Continuous Winding Caravan Road & Dual Wheel Rut Troughs along Z
      const roadCenterX = Math.sin(wz * 0.025) * 14;
      const roadOffset = wx - roadCenterX + (fbmDetail - 0.5) * 1.1;
      const roadDist = Math.abs(roadOffset);
      if (roadDist < 8.5 && wz > -72 && wz < 85) {
        const roadFade = smoothstep(8.5, 2.0, roadDist) * 0.55;
        // Continuous wheel rut grooves at offset ±1.35m from road center
        const rutDist = Math.min(Math.abs(roadOffset - 1.35), Math.abs(roadOffset + 1.35));
        const rutDarken = smoothstep(0.65, 0.12, rutDist) * 0.42;
        const rf = Math.min(0.85, roadFade + rutDarken);
        r = r * (1 - rf) + (78 - rutDarken * 28) * rf;
        g = g * (1 - rf) + (60 - rutDarken * 24) * rf;
        b = b * (1 - rf) + (42 - rutDarken * 18) * rf;
      }

      const idx = (py * size + px) * 4;
      data[idx] = Math.max(0, Math.min(255, r + grain));
      data[idx + 1] = Math.max(0, Math.min(255, g + grain));
      data[idx + 2] = Math.max(0, Math.min(255, b + grain * 0.8));
      data[idx + 3] = 255;
    }
  }
  cCtx.putImageData(imgData, 0, 0);

  // Seamless tileable high-frequency soil/pebble bump map (256x256)
  const bSize = 256;
  const bumpData = bCtx.createImageData(bSize, bSize);
  const bArr = bumpData.data;
  for (let y = 0; y < bSize; y++) {
    for (let x = 0; x < bSize; x++) {
      const u = (x / bSize) * Math.PI * 2;
      const v = (y / bSize) * Math.PI * 2;
      const tileN =
        Math.sin(u * 4 + Math.cos(v * 3)) * 0.35 +
        Math.cos(u * 9 - Math.sin(v * 7)) * 0.35 +
        (rand() - 0.5) * 0.6;
      const val = Math.max(0, Math.min(255, 128 + tileN * 75));
      const idx = (y * bSize + x) * 4;
      bArr[idx] = val;
      bArr[idx + 1] = val;
      bArr[idx + 2] = val;
      bArr[idx + 3] = 255;
    }
  }
  bCtx.putImageData(bumpData, 0, 0);

  const result = {
    map: toTexture(colorCanvas, 1, 1, true),
    bumpMap: toTexture(bumpCanvas, 1, 1, false),
  };
  textureCache.set('terrain', result);
  return result;
}

/**
 * Returns a complete dictionary of shared, cached PBR materials for characters, horses, weapons, and props.
 */
export function getMaterials() {
  if (materialCache.has('all')) return materialCache.get('all');

  const steelTex = getTemperedSteelTextures();
  const mailTex = getChainmailTextures();
  const crusaderSurcoat = getSurcoatTextures('crusader_red');
  const companionSurcoat = getSurcoatTextures('companion_gold');
  const hospitallerSurcoat = getSurcoatTextures('hospitaller');
  const saracenRoyal = getSurcoatTextures('saracen_royal');
  const saracenTurquoise = getSurcoatTextures('saracen_turquoise');
  const lamellarTex = getLamellarTextures();
  const gambesonTex = getGambesonTextures('#b9a582');
  const saracenGambesonTex = getGambesonTextures('#8c2222');
  const crusaderShieldTex = getShieldTextures('crusader_heater');
  const companionShieldTex = getShieldTextures('companion_heater');
  const saracenShieldTex = getShieldTextures('saracen_round');
  const horseGreyTex = getEquineCoatTextures('dapple_grey');
  const horseBayTex = getEquineCoatTextures('bay');
  const horseBlackTex = getEquineCoatTextures('black');
  const horseChestnutTex = getEquineCoatTextures('chestnut');
  const woodTex = getWoodAndLeatherTextures();

  const mats = {
    steelPlate: new THREE.MeshStandardMaterial({
      map: steelTex.map,
      bumpMap: steelTex.bumpMap,
      bumpScale: 0.035,
      roughnessMap: steelTex.roughnessMap,
      metalness: 0.88,
      roughness: 0.24,
    }),
    polishedBlade: new THREE.MeshStandardMaterial({
      map: steelTex.map,
      bumpMap: steelTex.bumpMap,
      bumpScale: 0.02,
      color: 0xeaf2fc,
      metalness: 0.95,
      roughness: 0.14,
    }),
    darkIron: new THREE.MeshStandardMaterial({
      map: steelTex.map,
      bumpMap: steelTex.bumpMap,
      bumpScale: 0.04,
      color: 0x383d45,
      metalness: 0.82,
      roughness: 0.42,
    }),
    gildedBrass: new THREE.MeshStandardMaterial({
      map: steelTex.map,
      bumpMap: steelTex.bumpMap,
      bumpScale: 0.025,
      color: 0xf0be48,
      metalness: 0.91,
      roughness: 0.2,
      emissive: 0x261804,
      emissiveIntensity: 0.35,
    }),
    chainmail: new THREE.MeshStandardMaterial({
      map: mailTex.map,
      bumpMap: mailTex.bumpMap,
      bumpScale: 0.06,
      metalness: 0.84,
      roughness: 0.36,
    }),
    visorSlit: new THREE.MeshBasicMaterial({
      color: 0x050608,
    }),
    crusaderSurcoat: new THREE.MeshStandardMaterial({
      map: crusaderSurcoat.map,
      bumpMap: crusaderSurcoat.bumpMap,
      bumpScale: 0.03,
      roughness: 0.78,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
    companionSurcoat: new THREE.MeshStandardMaterial({
      map: companionSurcoat.map,
      bumpMap: companionSurcoat.bumpMap,
      bumpScale: 0.03,
      roughness: 0.72,
      metalness: 0.1,
      side: THREE.DoubleSide,
    }),
    hospitallerSurcoat: new THREE.MeshStandardMaterial({
      map: hospitallerSurcoat.map,
      bumpMap: hospitallerSurcoat.bumpMap,
      bumpScale: 0.03,
      roughness: 0.76,
      metalness: 0.06,
      side: THREE.DoubleSide,
    }),
    saracenRoyalTunic: new THREE.MeshStandardMaterial({
      map: saracenRoyal.map,
      bumpMap: saracenRoyal.bumpMap,
      bumpScale: 0.03,
      roughness: 0.7,
      metalness: 0.12,
      side: THREE.DoubleSide,
    }),
    saracenTurquoiseTunic: new THREE.MeshStandardMaterial({
      map: saracenTurquoise.map,
      bumpMap: saracenTurquoise.bumpMap,
      bumpScale: 0.03,
      roughness: 0.72,
      metalness: 0.1,
      side: THREE.DoubleSide,
    }),
    saracenLamellar: new THREE.MeshStandardMaterial({
      map: lamellarTex.map,
      bumpMap: lamellarTex.bumpMap,
      bumpScale: 0.055,
      metalness: 0.78,
      roughness: 0.28,
    }),
    infantryGambeson: new THREE.MeshStandardMaterial({
      map: gambesonTex.map,
      bumpMap: gambesonTex.bumpMap,
      bumpScale: 0.045,
      roughness: 0.82,
      metalness: 0.04,
    }),
    saracenGambeson: new THREE.MeshStandardMaterial({
      map: saracenGambesonTex.map,
      bumpMap: saracenGambesonTex.bumpMap,
      bumpScale: 0.045,
      roughness: 0.8,
      metalness: 0.05,
    }),
    turbanWhite: new THREE.MeshStandardMaterial({
      bumpMap: gambesonTex.bumpMap,
      bumpScale: 0.025,
      color: 0xede5d5,
      roughness: 0.82,
    }),
    turbanSaffron: new THREE.MeshStandardMaterial({
      bumpMap: gambesonTex.bumpMap,
      bumpScale: 0.025,
      color: 0xd99b2e,
      roughness: 0.8,
    }),
    crusaderShield: new THREE.MeshStandardMaterial({
      map: crusaderShieldTex.map,
      bumpMap: crusaderShieldTex.bumpMap,
      bumpScale: 0.04,
      roughness: 0.45,
      metalness: 0.28,
    }),
    companionShield: new THREE.MeshStandardMaterial({
      map: companionShieldTex.map,
      bumpMap: companionShieldTex.bumpMap,
      bumpScale: 0.04,
      roughness: 0.4,
      metalness: 0.35,
    }),
    saracenShield: new THREE.MeshStandardMaterial({
      map: saracenShieldTex.map,
      bumpMap: saracenShieldTex.bumpMap,
      bumpScale: 0.045,
      roughness: 0.36,
      metalness: 0.52,
    }),
    capeCrimson: new THREE.MeshStandardMaterial({
      bumpMap: crusaderSurcoat.bumpMap,
      bumpScale: 0.025,
      color: 0x921616,
      roughness: 0.75,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
    capeCompanionGold: new THREE.MeshStandardMaterial({
      bumpMap: companionSurcoat.bumpMap,
      bumpScale: 0.025,
      color: 0xa11b1b,
      emissive: 0x1e0804,
      roughness: 0.68,
      metalness: 0.12,
      side: THREE.DoubleSide,
    }),
    leatherDark: new THREE.MeshStandardMaterial({
      bumpMap: woodTex.woodBump,
      bumpScale: 0.02,
      color: 0x362214,
      roughness: 0.58,
      metalness: 0.08,
    }),
    leatherSaddle: new THREE.MeshStandardMaterial({
      bumpMap: woodTex.woodBump,
      bumpScale: 0.025,
      color: 0x593318,
      roughness: 0.5,
      metalness: 0.1,
    }),
    woodOak: new THREE.MeshStandardMaterial({
      map: woodTex.woodMap,
      bumpMap: woodTex.woodBump,
      bumpScale: 0.04,
      roughness: 0.72,
      metalness: 0.04,
    }),
    woodWeathered: new THREE.MeshStandardMaterial({
      map: woodTex.weatheredMap,
      bumpMap: woodTex.woodBump,
      bumpScale: 0.04,
      roughness: 0.78,
      metalness: 0.03,
    }),
    woodSapwoodTip: new THREE.MeshStandardMaterial({
      bumpMap: woodTex.woodBump,
      bumpScale: 0.03,
      color: 0xc8a878,
      roughness: 0.74,
      metalness: 0.02,
    }),
    stoneMasonry: new THREE.MeshStandardMaterial({
      map: woodTex.stoneMap,
      bumpMap: woodTex.stoneBump,
      bumpScale: 0.055,
      roughness: 0.86,
      metalness: 0.04,
    }),
    horseDappleGrey: new THREE.MeshStandardMaterial({
      map: horseGreyTex.map,
      bumpMap: horseGreyTex.bumpMap,
      bumpScale: 0.025,
      roughness: 0.62,
      metalness: 0.06,
    }),
    horseBay: new THREE.MeshStandardMaterial({
      map: horseBayTex.map,
      bumpMap: horseBayTex.bumpMap,
      bumpScale: 0.025,
      roughness: 0.58,
      metalness: 0.08,
    }),
    horseBlack: new THREE.MeshStandardMaterial({
      map: horseBlackTex.map,
      bumpMap: horseBlackTex.bumpMap,
      bumpScale: 0.025,
      roughness: 0.52,
      metalness: 0.1,
    }),
    horseChestnut: new THREE.MeshStandardMaterial({
      map: horseChestnutTex.map,
      bumpMap: horseChestnutTex.bumpMap,
      bumpScale: 0.025,
      roughness: 0.58,
      metalness: 0.08,
    }),
    horseHairDark: new THREE.MeshStandardMaterial({
      bumpMap: woodTex.woodBump,
      bumpScale: 0.04,
      color: 0x1c1815,
      roughness: 0.82,
    }),
    horseHairSilver: new THREE.MeshStandardMaterial({
      bumpMap: woodTex.woodBump,
      bumpScale: 0.04,
      color: 0xd5dce6,
      roughness: 0.75,
    }),
    hoofIron: new THREE.MeshStandardMaterial({
      color: 0x262422,
      roughness: 0.45,
      metalness: 0.45,
    }),
    skinFair: new THREE.MeshStandardMaterial({
      color: 0xd9a986,
      roughness: 0.68,
    }),
    skinOlive: new THREE.MeshStandardMaterial({
      color: 0xb88460,
      roughness: 0.65,
    }),
  };

  materialCache.set('all', mats);
  return mats;
}
