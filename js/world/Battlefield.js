import * as THREE from '../vendor/three.module.js';
import { getTerrainTextures, getMaterials } from '../graphics/ProceduralTextures.js';

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Deterministic, continuous multi-zone heightmap covering the 320m x 320m Levantine battlefield:
 * - Central Clash Valley (r < 42): Gentle undulating terrain (y in [0.0, 1.4]) for clean cavalry & melee combat
 * - Northern Hilltop Outpost (x ~ 0, z ~ -65, r ~ 28): Flat-crowned tactical plateau at y ~ 4.8
 * - Eastern Archer Ridge (x ~ 58, z in [-45, 35]): Elevated tactical ridge at y ~ 3.8 - 5.2
 * - Western Siege & Palisade Ridge (x ~ -58, z in [-45, 35]): Elevated ridge at y ~ 3.2 - 4.5
 * - Outer Mountain Ring (r > 96): Ridged multifractal crags & terraced limestone escarpments (y ~ 8 - 28)
 */
export function getTerrainHeight(x, z) {
  const r = Math.hypot(x, z);

  // Base micro-undulation across the entire valley
  const rollingBase =
    0.42 +
    0.26 * Math.sin(x * 0.045 + 0.4) * Math.cos(z * 0.042 - 0.2) +
    0.15 * Math.sin(x * 0.095 - z * 0.08) +
    0.07 * Math.cos(x * 0.19 + z * 0.17);

  // Flatten slightly along the winding central charge road (x ~ sin(z * 0.025) * 14)
  const roadCenter = Math.sin(z * 0.025) * 14;
  const roadDist = Math.abs(x - roadCenter);
  const roadFlatten = 1 - 0.48 * (1 - smoothstep(2.5, 11.0, roadDist));

  let h = rollingBase * roadFlatten;

  // 1. Northern Hilltop Outpost (x ~ 0, z ~ -65): rises to flat-crowned plateau at y ~ 4.8
  const dNorth = Math.hypot(x * 0.92, (z + 65) * 1.04);
  if (dNorth < 34) {
    const plateauFactor = 1 - smoothstep(10.5, 33.0, dNorth);
    const rampNoise =
      0.12 * Math.sin(x * 0.22) * Math.cos(z * 0.22) * (1 - smoothstep(0, 12, dNorth));
    h += (4.58 + rampNoise) * plateauFactor;
  }

  // 2. Eastern Archer Ridge (x ~ 58, z in [-45, 35]): y ~ 3.8 - 5.2
  const eastRidgeCenterX = 58 + Math.sin(z * 0.045) * 4.5;
  const dxEast = Math.abs(x - eastRidgeCenterX);
  if (dxEast < 26 && z > -62 && z < 52) {
    const xProfile = 1 - smoothstep(4.0, 24.5, dxEast);
    const zProfile = smoothstep(-60, -40, z) * (1 - smoothstep(28, 50, z));
    const ridgeDetail =
      0.45 * Math.sin(z * 0.12 + 0.7) +
      0.22 * Math.cos(x * 0.24 - z * 0.18);
    h += (3.95 + ridgeDetail) * xProfile * zProfile;
  }

  // 3. Western Siege & Palisade Ridge (x ~ -58, z in [-45, 35]): y ~ 3.2 - 4.5
  const westRidgeCenterX = -58 + Math.cos(z * 0.04) * 4.5;
  const dxWest = Math.abs(x - westRidgeCenterX);
  if (dxWest < 26 && z > -62 && z < 52) {
    const xProfile = 1 - smoothstep(4.0, 24.5, dxWest);
    const zProfile = smoothstep(-60, -40, z) * (1 - smoothstep(28, 50, z));
    const ridgeDetail =
      0.38 * Math.cos(z * 0.11 - 0.4) +
      0.2 * Math.sin(x * 0.22 + z * 0.16);
    h += (3.35 + ridgeDetail) * xProfile * zProfile;
  }

  // 4. Southern Crusader Command Rise (gentle rise behind z ~ 78..100, excluding road)
  if (z > 62 && z < 104) {
    const southBell = smoothstep(62, 78, z) * (1 - smoothstep(92, 104, z));
    const flankMask = smoothstep(8, 22, Math.abs(x));
    h += 1.35 * southBell * flankMask;
  }

  // 5. Outer Mountain Ring (r > 96): Ridged multifractal crags & terraced limestone escarpments
  if (r > 96) {
    const ringRamp = smoothstep(96, 152, r);
    const angle = Math.atan2(z, x);

    // Sharp ridged multifractal folding (1 - |sin|) squared for angular peaks and ravines
    const r1 = 1.0 - Math.abs(Math.sin(angle * 7 + r * 0.045));
    const r2 = 1.0 - Math.abs(Math.cos(angle * 13 - r * 0.08));
    const r3 = 1.0 - Math.abs(Math.sin(x * 0.068 - z * 0.058));
    const ridge1 = r1 * r1;
    const ridge2 = r2 * r2;
    const ridge3 = r3 * r3;

    const rawMountain =
      7.5 +
      ridge1 * 13.5 +
      ridge2 * 6.8 +
      ridge3 * 4.6 +
      Math.sin(x * 0.085 + z * 0.07) * 1.6;

    // Subtle limestone plateau terracing
    const terraceStep = 3.4;
    const terraced =
      rawMountain - Math.sin((rawMountain / terraceStep) * Math.PI * 2) * 0.28;

    h += terraced * ringRamp;
  }

  return Math.max(0.0, h);
}

/**
 * Computes unit surface normal of the terrain at (x, z) via central finite differences.
 */
export function getTerrainNormal(x, z) {
  const eps = 0.35;
  const hx1 = getTerrainHeight(x + eps, z);
  const hx0 = getTerrainHeight(x - eps, z);
  const hz1 = getTerrainHeight(x, z + eps);
  const hz0 = getTerrainHeight(x, z - eps);
  const dx = (hx1 - hx0) / (2 * eps);
  const dz = (hz1 - hz0) / (2 * eps);
  return new THREE.Vector3(-dx, 1.0, -dz).normalize();
}

/**
 * Builds a seamless, horizontally periodic golden-hour Levantine sky dome with solar disc,
 * corona halo, sunlit clouds, and soft atmospheric distant horizon silhouettes.
 */
function createSkyDome() {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const rand = seededRandom(313);

  // 1. Vertical sky gradient (Zenith -> Mid Sky -> Golden Horizon -> Dusty Nadir)
  const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
  skyGrad.addColorStop(0.0, '#162d4c');
  skyGrad.addColorStop(0.22, '#2f5884');
  skyGrad.addColorStop(0.38, '#6f96b8');
  skyGrad.addColorStop(0.45, '#c8b294');
  skyGrad.addColorStop(0.495, '#f6cf8e');
  skyGrad.addColorStop(0.525, '#d8b88c');
  skyGrad.addColorStop(0.65, '#8c6b45');
  skyGrad.addColorStop(1.0, '#3d2c1b');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, height);

  // Sun UV coordinates aligned with sunLight position (65, 42, -48)
  const sunX = width * 0.64;
  const sunY = height * 0.36;

  // 2. Wide atmospheric solar corona (wrapped across seam for 100% periodicity)
  for (const offset of [-width, 0, width]) {
    const sx = sunX + offset;
    const coronaGrad = ctx.createRadialGradient(sx, sunY, 8, sx, sunY, 460);
    coronaGrad.addColorStop(0.0, 'rgba(255, 252, 235, 0.98)');
    coronaGrad.addColorStop(0.08, 'rgba(255, 236, 175, 0.86)');
    coronaGrad.addColorStop(0.24, 'rgba(255, 198, 112, 0.44)');
    coronaGrad.addColorStop(0.58, 'rgba(240, 165, 90, 0.14)');
    coronaGrad.addColorStop(1.0, 'rgba(240, 165, 90, 0.0)');
    ctx.fillStyle = coronaGrad;
    ctx.fillRect(0, 0, width, height);
  }

  // 3. Seamlessly wrapped cirrus wisps & golden-lit cumulus cloud banks
  for (let i = 0; i < 85; i++) {
    const cx = rand() * width;
    const cy = height * (0.16 + rand() * 0.28);
    const rw = 55 + rand() * 165;
    const rh = 10 + rand() * 26;
    const distToSun = Math.min(
      Math.hypot(cx - sunX, cy - sunY),
      Math.hypot(cx - width - sunX, cy - sunY),
      Math.hypot(cx + width - sunX, cy - sunY)
    );
    const sunProx = Math.max(0, 1 - distToSun / 550);
    const rCol = Math.round(235 + sunProx * 20);
    const gCol = Math.round(205 + sunProx * 32);
    const bCol = Math.round(170 + sunProx * 25);
    const alpha = 0.12 + rand() * 0.16 + sunProx * 0.15;

    // Draw at cx and cx ± width so clouds crossing x=0/width have zero seam
    for (const shift of [-width, 0, width]) {
      const drawX = cx + shift;
      if (drawX + rw < 0 || drawX - rw > width) continue;
      ctx.save();
      ctx.translate(drawX, cy);
      ctx.scale(1, rh / rw);
      const cGrad = ctx.createRadialGradient(0, -rw * 0.15, rw * 0.08, 0, 0, rw);
      cGrad.addColorStop(0.0, `rgba(${rCol}, ${gCol}, ${bCol}, ${alpha})`);
      cGrad.addColorStop(0.55, `rgba(${rCol - 30}, ${gCol - 35}, ${bCol - 30}, ${alpha * 0.65})`);
      cGrad.addColorStop(1.0, 'rgba(160, 140, 125, 0)');
      ctx.fillStyle = cGrad;
      ctx.beginPath();
      ctx.arc(0, 0, rw, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Blazing solar core disc
  ctx.fillStyle = '#fffef5';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 22, 0, Math.PI * 2);
  ctx.fill();

  // 4. Soft, hazy atmospheric distant mountain silhouettes (100% periodic in x)
  const horizonY = Math.floor(height * 0.515);

  ctx.fillStyle = 'rgba(196, 166, 130, 0.55)';
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let x = 0; x <= width; x += 8) {
    const nx = (x / width) * Math.PI * 2;
    const mHeight =
      14 +
      Math.sin(nx * 5 + 0.5) * 9 +
      Math.cos(nx * 11 - 1.2) * 6 +
      Math.abs(Math.sin(nx * 8)) * 5;
    ctx.lineTo(x, horizonY - mHeight);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  // Distant atmospheric Crusader Krak castle silhouettes veiled in golden dust
  const drawDistantCastle = (centerX, basePeakY, scale) => {
    ctx.save();
    ctx.fillStyle = 'rgba(176, 144, 108, 0.62)';
    const w = 62 * scale;
    const h = 22 * scale;
    ctx.fillRect(centerX - w * 0.5, basePeakY - h * 0.65, w, h * 0.75);
    ctx.fillRect(centerX - w * 0.16, basePeakY - h * 1.15, w * 0.32, h * 1.2);
    ctx.fillRect(centerX - w * 0.56, basePeakY - h * 0.9, w * 0.18, h);
    ctx.fillRect(centerX + w * 0.38, basePeakY - h * 0.9, w * 0.18, h);
    ctx.restore();
  };
  drawDistantCastle(width * 0.23, horizonY - 18, 1.0);
  drawDistantCastle(width * 0.78, horizonY - 15, 0.82);

  // Soft golden dust mist veil blending horizon into FogExp2 (#d8b88c)
  const mistGrad = ctx.createLinearGradient(0, horizonY - 38, 0, horizonY + 42);
  mistGrad.addColorStop(0.0, 'rgba(216, 184, 140, 0.0)');
  mistGrad.addColorStop(0.48, 'rgba(216, 184, 140, 0.78)');
  mistGrad.addColorStop(1.0, 'rgba(216, 184, 140, 1.0)');
  ctx.fillStyle = mistGrad;
  ctx.fillRect(0, horizonY - 38, width, 80);

  const skyTex = new THREE.CanvasTexture(canvas);
  skyTex.wrapS = THREE.RepeatWrapping;
  skyTex.wrapT = THREE.ClampToEdgeWrapping;
  skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.needsUpdate = true;

  const skyGeo = new THREE.SphereGeometry(260, 32, 24);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.rotation.y = -Math.PI * 0.42;
  return skyDome;
}

/**
 * Builds a fuller 6-blade 3D scrub grass tuft BufferGeometry with wider blades (halfW = 0.11).
 */
function createGrassTuftGeometry() {
  const blades = 6;
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];

  const rootColor = new THREE.Color(0x434a24);
  const midColor = new THREE.Color(0x788240);
  const tipColor = new THREE.Color(0xc8b466);

  let vertOffset = 0;
  for (let b = 0; b < blades; b++) {
    const angle = (b / blades) * Math.PI + (b % 2 === 0 ? 0.22 : -0.22);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const lean = 0.18 + (b % 3) * 0.09;
    const h = 0.52 + (b % 3) * 0.13;
    const halfW = 0.11;
    const offsetX = Math.cos(b * 2.1) * 0.09;
    const offsetZ = Math.sin(b * 2.1) * 0.09;

    const pts = [
      [offsetX - halfW * cosA, 0.0, offsetZ - halfW * sinA, rootColor],
      [offsetX + halfW * cosA, 0.0, offsetZ + halfW * sinA, rootColor],
      [
        offsetX - halfW * 0.68 * cosA - sinA * lean * 0.48,
        h * 0.52,
        offsetZ - halfW * 0.68 * sinA + cosA * lean * 0.48,
        midColor,
      ],
      [
        offsetX + halfW * 0.68 * cosA - sinA * lean * 0.48,
        h * 0.52,
        offsetZ + halfW * 0.68 * sinA + cosA * lean * 0.48,
        midColor,
      ],
      [offsetX - sinA * lean, h, offsetZ + cosA * lean, tipColor],
    ];

    for (const [px, py, pz, col] of pts) {
      positions.push(px, py, pz);
      normals.push(0, 1, 0);
      colors.push(col.r, col.g, col.b);
    }

    indices.push(
      vertOffset + 0, vertOffset + 1, vertOffset + 2,
      vertOffset + 1, vertOffset + 3, vertOffset + 2,
      vertOffset + 2, vertOffset + 3, vertOffset + 4
    );
    vertOffset += 5;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds an angular, faceted Levantine limestone boulder BufferGeometry with a
 * soil-to-limestone vertex color gradient so rocks blend naturally into the ground.
 */
function createLimestoneRockGeometry() {
  const baseGeo = new THREE.DodecahedronGeometry(1.0, 1);
  const geo = baseGeo.index ? baseGeo.toNonIndexed() : baseGeo;
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const soilCol = new THREE.Color(0x52402c);
  const midRockCol = new THREE.Color(0x9e8e74);
  const topRockCol = new THREE.Color(0xc2b49a);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    let vx = pos.getX(i);
    let vy = pos.getY(i);
    let vz = pos.getZ(i);

    const n =
      1.0 +
      0.19 * Math.sin(vx * 3.7 + vy * 2.3) +
      0.15 * Math.cos(vz * 4.1 - vx * 2.9);
    vx *= n * 1.18;
    vy *= n * (vy < 0 ? 0.58 : 0.82);
    vz *= n * 1.12;

    pos.setXYZ(i, vx, vy, vz);

    // Smooth vertical gradient: dark soil at base -> warm limestone -> sunlit crest
    const hNorm = Math.max(0, Math.min(1, (vy + 0.65) / 1.55));
    if (hNorm < 0.45) {
      tmp.copy(soilCol).lerp(midRockCol, hNorm / 0.45);
    } else {
      tmp.copy(midRockCol).lerp(topRockCol, (hNorm - 0.45) / 0.55);
    }
    const cragShade = 0.92 + 0.08 * Math.sin(vx * 5.0 + vz * 5.0);
    colors[i * 3] = tmp.r * cragShade;
    colors[i * 3 + 1] = tmp.g * cragShade;
    colors[i * 3 + 2] = tmp.b * cragShade;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Helper to merge an array of non-indexed BufferGeometries into one BufferGeometry.
 */
function mergeBufferGeometries(geos) {
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const posArr = new Float32Array(total * 3);
  const normArr = new Float32Array(total * 3);
  const colArr = new Float32Array(total * 3);
  let hasColor = false;
  let offset = 0;

  for (const g of geos) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const c = g.attributes.color;
    posArr.set(p.array, offset * 3);
    if (n) normArr.set(n.array, offset * 3);
    if (c) {
      colArr.set(c.array, offset * 3);
      hasColor = true;
    }
    offset += p.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
  if (hasColor) out.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  return out;
}

/**
 * Builds a gnarled Mediterranean tree trunk + primary branches BufferGeometry.
 */
function createTreeTrunkGeometry() {
  const parts = [];
  const mainTrunk = new THREE.CylinderGeometry(0.18, 0.34, 2.5, 7).toNonIndexed();
  mainTrunk.translate(0, 1.2, 0);
  parts.push(mainTrunk);

  const branchSpecs = [
    { rx: 0.45, rz: 0.38, y: 2.25, len: 1.45 },
    { rx: -0.42, rz: 0.35, y: 2.2, len: 1.35 },
    { rx: 0.15, rz: -0.48, y: 2.3, len: 1.4 },
  ];
  for (const b of branchSpecs) {
    const br = new THREE.CylinderGeometry(0.08, 0.16, b.len, 6).toNonIndexed();
    br.translate(0, b.len * 0.5, 0);
    br.rotateX(b.rx);
    br.rotateZ(b.rz);
    br.translate(0, b.y, 0);
    parts.push(br);
  }

  const merged = mergeBufferGeometries(parts);
  merged.computeVertexNormals();
  return merged;
}

/**
 * Builds a multi-crowned Mediterranean olive/cypress foliage canopy BufferGeometry with vertex colors.
 */
function createTreeCanopyGeometry() {
  const lobes = [
    { x: 0.0, y: 3.55, z: 0.0, sx: 1.65, sy: 1.15, sz: 1.65 },
    { x: 0.95, y: 3.15, z: 0.55, sx: 1.25, sy: 0.92, sz: 1.25 },
    { x: -0.92, y: 3.1, z: 0.48, sx: 1.2, sy: 0.9, sz: 1.2 },
    { x: 0.15, y: 3.2, z: -0.95, sx: 1.3, sy: 0.95, sz: 1.25 },
    { x: 0.0, y: 4.35, z: 0.0, sx: 1.15, sy: 0.95, sz: 1.15 },
  ];

  const geos = [];
  const darkLeaf = new THREE.Color(0x354222);
  const midLeaf = new THREE.Color(0x5b6b3a);
  const silverTip = new THREE.Color(0x889660);
  const tmp = new THREE.Color();

  for (const l of lobes) {
    const rawG = new THREE.DodecahedronGeometry(1.0, 1);
    const g = rawG.index ? rawG.toNonIndexed() : rawG;
    const pos = g.attributes.position;
    const cols = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      let vx = pos.getX(i);
      let vy = pos.getY(i);
      let vz = pos.getZ(i);
      const bump = 1.0 + 0.14 * Math.sin(vx * 4.2 + vz * 3.8);
      const t = Math.max(0, Math.min(1, (vy + 1.0) * 0.5));
      tmp.copy(darkLeaf).lerp(midLeaf, t).lerp(silverTip, t * t * 0.55);

      pos.setXYZ(i, vx * l.sx * bump + l.x, vy * l.sy * bump + l.y, vz * l.sz * bump + l.z);
      cols[i * 3] = tmp.r;
      cols[i * 3 + 1] = tmp.g;
      cols[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    geos.push(g);
  }

  return mergeBufferGeometries(geos);
}

/**
 * Creates the complete 3D Levantine battlefield environment:
 * sculpted 220x220 heightmap terrain with 28x micro-bump shader tiling, seamless sky dome,
 * dramatic golden-hour shadow-tracking lighting, 4,500 clustered 3D grass tufts,
 * 320 grounded limestone boulders, 65 instanced Mediterranean olive/cypress trees,
 * and batched instanced battlefield debris.
 */
export function createBattlefield(scene, renderer) {
  const mats = getMaterials();
  const terrainTex = getTerrainTextures(getTerrainHeight);

  // 1. Exponential Levantine Dust Fog
  scene.fog = new THREE.FogExp2(0xd8b88c, 0.0042);

  // 2. Sculpted High-Resolution Terrain Mesh (320m x 320m, 220x220 segments)
  const terrainGeo = new THREE.PlaneGeometry(320, 320, 220, 220);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const vertexColors = new Float32Array(posAttr.count * 3);

  const colMud = new THREE.Color(0x9a846c);
  const colSand = new THREE.Color(0xf8ecda);
  const colScrub = new THREE.Color(0xdadbb8);
  const colLimestone = new THREE.Color(0xebe5d8);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const vy = getTerrainHeight(vx, vz);
    posAttr.setY(i, vy);

    const distCenter = Math.hypot(vx, vz * 0.85);
    // Smooth organic macro variation (no high-frequency sine grid or hard height bands)
    const macroNoise =
      Math.sin(vx * 0.035 + vz * 0.028) * 0.5 +
      Math.cos(vx * 0.022 - vz * 0.041) * 0.5;
    const micro = 0.96 + 0.04 * macroNoise;

    const mudBlend = (1 - smoothstep(14, 46, distCenter)) * (1 - smoothstep(1.2, 2.8, vy));
    const scrubBlend = smoothstep(1.2, 3.6, vy + macroNoise * 0.8);
    const rockBlend = smoothstep(4.5, 11.0, vy + macroNoise * 1.2);

    tmpColor.copy(colSand);
    tmpColor.lerp(colMud, mudBlend * 0.42);
    tmpColor.lerp(colScrub, scrubBlend * 0.65);
    tmpColor.lerp(colLimestone, rockBlend * 0.85);

    vertexColors[i * 3] = Math.min(1, tmpColor.r * micro);
    vertexColors[i * 3 + 1] = Math.min(1, tmpColor.g * micro);
    vertexColors[i * 3 + 2] = Math.min(1, tmpColor.b * micro);
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    map: terrainTex.map,
    bumpMap: terrainTex.bumpMap,
    bumpScale: 0.14,
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.04,
  });

  // Multiply bumpMap UV coordinates by 28.0 in the fragment shader so soil/pebble
  // micro-relief tiles crisply at 28x while the macro splat map remains (1, 1)!
  terrainMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <bumpmap_pars_fragment>',
      THREE.ShaderChunk.bumpmap_pars_fragment.replace(
        /vBumpMapUv/g,
        '(vBumpMapUv * 28.0)'
      )
    );
  };

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.name = 'BattlefieldTerrain';
  scene.add(terrainMesh);

  // 3. Seamless Sky Dome & Atmospheric Horizon Silhouettes
  const skyDome = createSkyDome();
  skyDome.name = 'SkyDome';
  scene.add(skyDome);

  // 4. Cinematic Golden-Hour Lighting & Tightened Real-Time Shadows
  const sunLightOffset = new THREE.Vector3(65, 42, -48);
  const sunLight = new THREE.DirectionalLight(0xfff0d2, 2.65);
  sunLight.position.copy(sunLightOffset);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -62;
  sunLight.shadow.camera.right = 62;
  sunLight.shadow.camera.top = 62;
  sunLight.shadow.camera.bottom = -62;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 220;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const hemiLight = new THREE.HemisphereLight(0x8db3dc, 0x7c5d38, 0.68);
  scene.add(hemiLight);

  const rimLight = new THREE.DirectionalLight(0x9ab8e6, 0.75);
  rimLight.position.set(-45, 35, 60);
  scene.add(rimLight);

  const rand = seededRandom(909);
  const dummy = new THREE.Object3D();
  const upVec = new THREE.Vector3(0, 1, 0);
  const alignQuat = new THREE.Quaternion();
  const yawQuat = new THREE.Quaternion();
  const instColor = new THREE.Color();

  // 5. Instanced Grounded Limestone Boulders & Outcrops (320 Sculpted Rocks)
  const rockCount = 320;
  const rockGeo = createLimestoneRockGeometry();
  const rockMat = new THREE.MeshStandardMaterial({
    bumpMap: terrainTex.bumpMap,
    bumpScale: 0.06,
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.04,
  });
  const rocksInstanced = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rocksInstanced.castShadow = true;
  rocksInstanced.receiveShadow = true;
  rocksInstanced.name = 'InstancedRocks';

  const rockCenters = [];
  let placedRocks = 0;
  while (placedRocks < rockCount) {
    const rx = (rand() - 0.5) * 260;
    const rz = (rand() - 0.5) * 260;
    const distOrigin = Math.hypot(rx, rz);
    const roadCenter = Math.sin(rz * 0.025) * 14;
    if (Math.abs(rx - roadCenter) < 11.5) continue;
    if (distOrigin < 28 && rand() < 0.82) continue;

    const ry = getTerrainHeight(rx, rz);
    const nrm = getTerrainNormal(rx, rz);
    if (distOrigin > 92 || nrm.y < 0.76) continue;
    const isOuterCrag = distOrigin > 78;
    const baseScale = isOuterCrag ? 0.9 + rand() * 1.4 : 0.4 + rand() * 1.1;
    const sx = baseScale * (0.85 + rand() * 0.55);
    const sy = baseScale * (0.55 + rand() * 0.55);
    const sz = baseScale * (0.85 + rand() * 0.55);

    // Sink boulders deeply into sloped ground and align partially with slope normal
    dummy.position.set(rx, ry - sy * 0.55, rz);
    alignQuat.setFromUnitVectors(upVec, nrm);
    yawQuat.setFromAxisAngle(upVec, rand() * Math.PI * 2);
    dummy.quaternion.copy(alignQuat).multiply(yawQuat);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    rocksInstanced.setMatrixAt(placedRocks, dummy.matrix);

    const shade = 0.84 + rand() * 0.24;
    instColor.setRGB(shade, shade * 0.97, shade * 0.92);
    rocksInstanced.setColorAt(placedRocks, instColor);

    if (distOrigin < 86) {
      rockCenters.push({ x: rx, z: rz, r: Math.max(sx, sz) });
    }
    placedRocks++;
  }
  rocksInstanced.instanceMatrix.needsUpdate = true;
  if (rocksInstanced.instanceColor) rocksInstanced.instanceColor.needsUpdate = true;
  scene.add(rocksInstanced);

  // 6. Instanced Clustered Scrub Grass (4,500 6-Blade 3D Grass Tufts)
  const grassCount = 4500;
  const grassGeo = createGrassTuftGeometry();
  const grassMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.84,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const grassInstanced = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
  grassInstanced.castShadow = false;
  grassInstanced.receiveShadow = true;
  grassInstanced.name = 'InstancedGrass';

  let placedGrass = 0;
  while (placedGrass < grassCount) {
    let gx, gz;
    // 45% of grass tufts cluster organically around boulders, road verges, and ridge slopes
    if (placedGrass < grassCount * 0.45 && rockCenters.length > 0) {
      const rc = rockCenters[placedGrass % rockCenters.length];
      const angle = rand() * Math.PI * 2;
      const dist = rc.r * 0.65 + rand() * 3.8;
      gx = rc.x + Math.cos(angle) * dist;
      gz = rc.z + Math.sin(angle) * dist;
    } else {
      gx = (rand() - 0.5) * 172;
      gz = (rand() - 0.5) * 172;
    }

    if (Math.hypot(gx, gz) > 88) continue;
    const roadCenter = Math.sin(gz * 0.025) * 14;
    const roadDist = Math.abs(gx - roadCenter);
    // Keep the central wheel-rut road clear while lining its verges (roadDist 5.5..9.5)
    if (roadDist < 5.2) continue;

    const gy = getTerrainHeight(gx, gz);
    const nrm = getTerrainNormal(gx, gz);
    if (nrm.y < 0.78) continue;

    dummy.position.set(gx, gy - 0.04, gz);
    alignQuat.setFromUnitVectors(upVec, nrm);
    yawQuat.setFromAxisAngle(upVec, rand() * Math.PI * 2);
    dummy.quaternion.copy(alignQuat).multiply(yawQuat);

    const s = 0.72 + rand() * 1.05;
    dummy.scale.set(s, s * (0.82 + rand() * 0.52), s);
    dummy.updateMatrix();
    grassInstanced.setMatrixAt(placedGrass, dummy.matrix);

    instColor.setHSL(0.16 + (rand() - 0.5) * 0.06, 0.3 + rand() * 0.18, 0.45 + rand() * 0.22);
    grassInstanced.setColorAt(placedGrass, instColor);
    placedGrass++;
  }
  grassInstanced.instanceMatrix.needsUpdate = true;
  if (grassInstanced.instanceColor) grassInstanced.instanceColor.needsUpdate = true;
  scene.add(grassInstanced);

  // 7. Instanced Mediterranean Olive & Cypress Trees (65 Trees along Ridges & Camps)
  const treeCount = 65;
  const trunkGeo = createTreeTrunkGeometry();
  const canopyGeo = createTreeCanopyGeometry();
  const canopyMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.02,
  });

  const treeTrunksInstanced = new THREE.InstancedMesh(trunkGeo, mats.woodWeathered, treeCount);
  const treeFoliageInstanced = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount);
  treeTrunksInstanced.castShadow = true;
  treeTrunksInstanced.receiveShadow = true;
  treeFoliageInstanced.castShadow = true;
  treeFoliageInstanced.receiveShadow = true;

  let placedTrees = 0;
  while (placedTrees < treeCount) {
    const tx = (rand() - 0.5) * 180;
    const tz = (rand() - 0.5) * 180;
    const distCenter = Math.hypot(tx, tz);
    const roadCenter = Math.sin(tz * 0.025) * 14;

    // Keep central clash valley (r < 44), hilltop dais (0, -65), watchtowers, and palisades open
    if (distCenter < 44 || distCenter > 90) continue;
    if (Math.abs(tx - roadCenter) < 16) continue;
    if (Math.hypot(tx, tz + 65) < 18 || Math.hypot(tx, tz + 48) < 15) continue;
    if (Math.hypot(tx + 42, tz + 35) < 14 || Math.hypot(tx - 45, tz + 40) < 14) continue;
    if (Math.abs(Math.abs(tx) - 48) < 8 && tz > -34 && tz < 28) continue;

    const ty = getTerrainHeight(tx, tz);
    if (ty > 11) continue;

    const isCypress = placedTrees % 3 === 0;
    const scaleXZ = isCypress ? 0.55 + rand() * 0.25 : 0.85 + rand() * 0.55;
    const scaleY = isCypress ? 1.35 + rand() * 0.5 : 0.8 + rand() * 0.45;

    dummy.position.set(tx, ty - 0.15, tz);
    dummy.rotation.set(
      (rand() - 0.5) * 0.12,
      rand() * Math.PI * 2,
      (rand() - 0.5) * 0.12
    );
    dummy.scale.set(scaleXZ, scaleY, scaleXZ);
    dummy.updateMatrix();

    treeTrunksInstanced.setMatrixAt(placedTrees, dummy.matrix);
    treeFoliageInstanced.setMatrixAt(placedTrees, dummy.matrix);

    const tint = 0.86 + rand() * 0.24;
    instColor.setRGB(tint * 0.95, tint, tint * 0.9);
    treeFoliageInstanced.setColorAt(placedTrees, instColor);
    placedTrees++;
  }
  treeTrunksInstanced.instanceMatrix.needsUpdate = true;
  treeFoliageInstanced.instanceMatrix.needsUpdate = true;
  if (treeFoliageInstanced.instanceColor) treeFoliageInstanced.instanceColor.needsUpdate = true;
  scene.add(treeTrunksInstanced, treeFoliageInstanced);

  // 8. Batched Central Battlefield Aftermath Debris (6 InstancedMeshes total in debrisGroup!)
  const debrisGroup = new THREE.Group();
  debrisGroup.name = 'BattlefieldDebris';

  // 8a. 18 Half-Buried Crusader Heater Shields + 18 Saracen Round Shields (InstancedMesh)
  const heaterShieldGeo = new THREE.BoxGeometry(0.68, 0.88, 0.045);
  const roundShieldGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.045, 16);
  const heaterInst = new THREE.InstancedMesh(heaterShieldGeo, mats.crusaderShield, 18);
  const roundInst = new THREE.InstancedMesh(roundShieldGeo, mats.saracenShield, 18);
  heaterInst.castShadow = true;
  heaterInst.receiveShadow = true;
  roundInst.castShadow = true;
  roundInst.receiveShadow = true;

  for (let i = 0; i < 18; i++) {
    // Heater shield placement
    const a1 = rand() * Math.PI * 2;
    const r1 = 6 + rand() * 46;
    const x1 = Math.cos(a1) * r1;
    const z1 = Math.sin(a1) * r1;
    dummy.position.set(x1, getTerrainHeight(x1, z1) + 0.06, z1);
    dummy.rotation.set(0.95 + (rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.6);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    heaterInst.setMatrixAt(i, dummy.matrix);

    // Saracen round shield placement
    const a2 = rand() * Math.PI * 2;
    const r2 = 6 + rand() * 46;
    const x2 = Math.cos(a2) * r2;
    const z2 = Math.sin(a2) * r2;
    dummy.position.set(x2, getTerrainHeight(x2, z2) + 0.06, z2);
    dummy.rotation.set((rand() - 0.5) * 0.7, rand() * Math.PI * 2, 0.35 + (rand() - 0.5) * 0.6);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    roundInst.setMatrixAt(i, dummy.matrix);
  }
  heaterInst.instanceMatrix.needsUpdate = true;
  roundInst.instanceMatrix.needsUpdate = true;
  debrisGroup.add(heaterInst, roundInst);

  // 8b. 80 Feathered Arrows Stuck in the Earth (2 InstancedMeshes)
  const arrowCount = 80;
  const shaftGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.88, 5);
  shaftGeo.translate(0, 0.44, 0);
  const fletchGeo = new THREE.BoxGeometry(0.06, 0.14, 0.008);
  fletchGeo.translate(0, 0.8, 0);
  const fletchMat = new THREE.MeshStandardMaterial({
    color: 0xe8dfd1,
    roughness: 0.8,
  });

  const shaftsInst = new THREE.InstancedMesh(shaftGeo, mats.woodOak, arrowCount);
  const fletchInst = new THREE.InstancedMesh(fletchGeo, fletchMat, arrowCount);

  for (let i = 0; i < arrowCount; i++) {
    const ax = (rand() - 0.5) * 95;
    const az = (rand() - 0.5) * 95;
    const ay = getTerrainHeight(ax, az);

    dummy.position.set(ax, ay - 0.12, az);
    dummy.rotation.set(
      (rand() - 0.5) * 0.75 + 0.25,
      rand() * Math.PI * 2,
      (rand() - 0.5) * 0.75
    );
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    shaftsInst.setMatrixAt(i, dummy.matrix);
    fletchInst.setMatrixAt(i, dummy.matrix);
  }
  shaftsInst.instanceMatrix.needsUpdate = true;
  fletchInst.instanceMatrix.needsUpdate = true;
  debrisGroup.add(shaftsInst, fletchInst);

  // 8c. 18 Abandoned Spears / Cavalry Lances (2 InstancedMeshes: shafts + steel tips)
  const spearCount = 18;
  const spearShaftGeo = new THREE.CylinderGeometry(0.024, 0.028, 2.6, 6);
  spearShaftGeo.translate(0, 1.0, 0);
  const spearHeadGeo = new THREE.ConeGeometry(0.055, 0.28, 4);
  spearHeadGeo.translate(0, 2.4, 0);

  const spearShaftInst = new THREE.InstancedMesh(spearShaftGeo, mats.woodOak, spearCount);
  const spearHeadInst = new THREE.InstancedMesh(spearHeadGeo, mats.steelPlate, spearCount);
  spearShaftInst.castShadow = true;

  for (let i = 0; i < spearCount; i++) {
    const sx = (rand() - 0.5) * 76;
    const sz = (rand() - 0.5) * 76;
    const sy = getTerrainHeight(sx, sz);

    dummy.position.set(sx, sy - 0.2, sz);
    dummy.rotation.set(
      0.35 + (rand() - 0.5) * 0.5,
      rand() * Math.PI * 2,
      0.25 + (rand() - 0.5) * 0.5
    );
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    spearShaftInst.setMatrixAt(i, dummy.matrix);
    spearHeadInst.setMatrixAt(i, dummy.matrix);
  }
  spearShaftInst.instanceMatrix.needsUpdate = true;
  spearHeadInst.instanceMatrix.needsUpdate = true;
  debrisGroup.add(spearShaftInst, spearHeadInst);

  scene.add(debrisGroup);

  /**
   * Frame update: keeps directional shadow frustum tightly centered on the player
   * and anchors the sky dome horizontally to the camera/player.
   */
  function update(dt, time, playerPos) {
    if (playerPos) {
      sunLight.position.set(
        playerPos.x + sunLightOffset.x,
        sunLightOffset.y,
        playerPos.z + sunLightOffset.z
      );
      sunLight.target.position.set(playerPos.x, 0, playerPos.z);
      sunLight.target.updateMatrixWorld();

      skyDome.position.x = playerPos.x;
      skyDome.position.z = playerPos.z;
    }
  }

  return {
    terrainMesh,
    sunLight,
    hemiLight,
    rimLight,
    skyDome,
    grassInstanced,
    rocksInstanced,
    treeTrunksInstanced,
    treeFoliageInstanced,
    debrisGroup,
    getTerrainHeight,
    getTerrainNormal,
    update,
  };
}
