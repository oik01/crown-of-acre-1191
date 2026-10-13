import * as THREE from '../vendor/three.module.js';
import { getMaterials } from '../graphics/ProceduralTextures.js';
import { registerWindCloth, mergeStaticMeshesByMaterial } from '../graphics/PostProcessing.js';

const tentTextureCache = new Map();

/**
 * Generates striped medieval pavilion canopy textures (Crusader Crimson/Ivory or Saracen Turquoise/Gold).
 */
function getPavilionTexture(faction = 'crusader') {
  if (tentTextureCache.has(faction)) return tentTextureCache.get(faction);

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const stripes = 16;
  const stripeW = size / stripes;

  for (let i = 0; i < stripes; i++) {
    if (faction === 'crusader') {
      ctx.fillStyle = i % 2 === 0 ? '#981b1b' : '#ebe0cc';
    } else {
      ctx.fillStyle = i % 2 === 0 ? '#16535e' : '#d8a33a';
    }
    ctx.fillRect(i * stripeW, 0, stripeW + 1, size);

    ctx.fillStyle = 'rgba(20, 12, 6, 0.22)';
    ctx.fillRect(i * stripeW, 0, 3, size);
  }

  ctx.fillStyle = faction === 'crusader' ? '#d4a238' : '#7a1616';
  ctx.fillRect(0, size - 48, size, 28);
  ctx.strokeStyle = '#f2cc72';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, size - 48, size, 28);

  const grad = ctx.createLinearGradient(0, size - 90, 0, size);
  grad.addColorStop(0, 'rgba(40, 28, 16, 0)');
  grad.addColorStop(1, 'rgba(40, 28, 16, 0.45)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, size - 90, size, 90);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  tentTextureCache.set(faction, tex);
  return tex;
}

/**
 * Helper to register a circular collider in the colliders array.
 */
function addCollider(colliders, x, y, z, radius, type = 'prop', label = '') {
  const c = {
    x,
    y,
    z,
    radius,
    r: radius,
    type,
    label,
    position: new THREE.Vector3(x, y, z),
  };
  colliders.push(c);
  return c;
}

/**
 * Constructs a multi-log timber palisade wall section with stone/earthwork gabion berm,
 * oak logs, blonde sapwood pointed tips, weathered crossbeams, iron bindings, and angled stakes.
 */
function createPalisadeSection(mats, length = 7.2, withStakes = true) {
  const group = new THREE.Group();
  const numLogs = Math.max(4, Math.floor(length / 0.42));
  const actualSpan = (numLogs - 1) * 0.42;

  // Mounded stone & earthwork gabion berm anchoring the base into sloped terrain
  const bermGeo = new THREE.BoxGeometry(actualSpan + 0.75, 0.65, 1.05);
  const berm = new THREE.Mesh(bermGeo, mats.stoneMasonry);
  berm.position.set(0, 0.12, 0.08);
  group.add(berm);

  const logGeo = new THREE.CylinderGeometry(0.19, 0.21, 2.7, 7);
  const tipGeo = new THREE.ConeGeometry(0.19, 0.55, 7);

  for (let i = 0; i < numLogs; i++) {
    const lx = (i - (numLogs - 1) * 0.5) * 0.42;
    const hVar = ((i * 37) % 5) * 0.06 - 0.1;
    const logMat = i % 3 === 0 ? mats.woodWeathered : mats.woodOak;

    const logMesh = new THREE.Mesh(logGeo, logMat);
    logMesh.position.set(lx, 1.25 + hVar * 0.5, 0);
    logMesh.rotation.y = (i * 1.1) % (Math.PI * 2);

    // Freshly hewn blonde sapwood tip for crisp visual silhouette
    const tipMesh = new THREE.Mesh(tipGeo, mats.woodSapwoodTip);
    tipMesh.position.set(lx, 2.6 + hVar + 0.26, 0);
    tipMesh.rotation.y = logMesh.rotation.y;

    group.add(logMesh, tipMesh);
  }

  // Horizontal weathered crossbeams & dark iron binding brackets
  const beamGeo = new THREE.BoxGeometry(actualSpan + 0.44, 0.18, 0.16);
  const ironStrapGeo = new THREE.BoxGeometry(0.16, 0.24, 0.22);
  for (const by of [0.82, 1.92]) {
    const beam = new THREE.Mesh(beamGeo, mats.woodWeathered);
    beam.position.set(0, by, -0.18);
    group.add(beam);

    for (const sx of [-actualSpan * 0.38, 0, actualSpan * 0.38]) {
      const strap = new THREE.Mesh(ironStrapGeo, mats.darkIron);
      strap.position.set(sx, by, -0.18);
      group.add(strap);
    }
  }

  // Diagonal rear brace struts
  const strutGeo = new THREE.CylinderGeometry(0.11, 0.13, 2.3, 6);
  for (const sx of [-actualSpan * 0.35, actualSpan * 0.35]) {
    const strut = new THREE.Mesh(strutGeo, mats.woodWeathered);
    strut.position.set(sx, 0.95, -0.78);
    strut.rotation.x = -0.62;
    group.add(strut);
  }

  // Forward-pointing sharpened defensive stakes (Chevaux-de-Frise)
  if (withStakes) {
    const stakeGeo = new THREE.CylinderGeometry(0.035, 0.11, 2.1, 6);
    const sapTipGeo = new THREE.ConeGeometry(0.055, 0.34, 6);
    const numStakes = Math.floor(numLogs * 0.65);

    for (let s = 0; s < numStakes; s++) {
      const sx = (s - (numStakes - 1) * 0.5) * 0.64;
      const stakeGroup = new THREE.Group();
      const stake = new THREE.Mesh(stakeGeo, mats.woodOak);
      const sapTip = new THREE.Mesh(sapTipGeo, mats.woodSapwoodTip);
      sapTip.position.y = 1.18;
      stakeGroup.add(stake, sapTip);

      stakeGroup.position.set(sx, 0.62, 0.65);
      stakeGroup.rotation.x = Math.PI * 0.31;
      group.add(stakeGroup);
    }
  }

  return mergeStaticMeshesByMaterial(group, { castShadow: true, receiveShadow: true });
}

/**
 * Constructs a standalone portable Chevaux-de-Frise anti-cavalry stake barrier.
 */
function createChevauxDeFrise(mats, width = 4.2) {
  const group = new THREE.Group();
  const spineGeo = new THREE.CylinderGeometry(0.15, 0.15, width, 8);
  spineGeo.rotateZ(Math.PI / 2);
  const spine = new THREE.Mesh(spineGeo, mats.woodWeathered);
  spine.position.y = 0.72;
  group.add(spine);

  const ringGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.12, 8);
  ringGeo.rotateZ(Math.PI / 2);
  for (const rx of [-width * 0.36, 0, width * 0.36]) {
    const ring = new THREE.Mesh(ringGeo, mats.darkIron);
    ring.position.set(rx, 0.72, 0);
    group.add(ring);
  }

  const stakeGeo = new THREE.CylinderGeometry(0.03, 0.088, 2.2, 6);
  const tipGeo = new THREE.ConeGeometry(0.048, 0.3, 6);
  const count = 7;

  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) * 0.5) * (width / count);
    for (const angle of [0.68, -0.68]) {
      const spear = new THREE.Group();
      const shaft = new THREE.Mesh(stakeGeo, mats.woodOak);
      const tip = new THREE.Mesh(tipGeo, mats.woodSapwoodTip);
      tip.position.y = 1.22;
      spear.add(shaft, tip);
      spear.position.set(x, 0.72, 0);
      spear.rotation.x = angle;
      group.add(spear);
    }
  }

  return mergeStaticMeshesByMaterial(group, { castShadow: true, receiveShadow: true });
}

/**
 * Constructs an imposing Northern Timber Siege Gatehouse spanning x in [-6.5, 6.5], z = -48
 * with flanked timber/stone towers, overhead crenellated archer bridge, and heavy iron-bound gates.
 */
function createSiegeGatehouse(mats) {
  const gatehouse = new THREE.Group();

  // Left and Right Flanking Gate Piers (x = ±4.6, leaving a 7m central road breach)
  const pierFoundationGeo = new THREE.BoxGeometry(2.6, 1.1, 2.8);
  const postGeo = new THREE.CylinderGeometry(0.24, 0.28, 6.4, 8);
  const wallPlankGeo = new THREE.BoxGeometry(2.2, 4.2, 2.2);

  for (const side of [-1, 1]) {
    const px = side * 4.6;
    const found = new THREE.Mesh(pierFoundationGeo, mats.stoneMasonry);
    found.position.set(px, 0.25, 0);
    gatehouse.add(found);

    const core = new THREE.Mesh(wallPlankGeo, mats.woodOak);
    core.position.set(px, 2.4, 0);
    gatehouse.add(core);

    for (const cx of [-1.05, 1.05]) {
      for (const cz of [-1.05, 1.05]) {
        const post = new THREE.Mesh(postGeo, mats.woodWeathered);
        post.position.set(px + cx, 3.0, cz);
        gatehouse.add(post);
      }
    }
  }

  // Overhead Archer Bridge & Crenellated Parapet spanning x in [-6.0, 6.0] at y = 4.4..6.2
  const bridgeDeckGeo = new THREE.BoxGeometry(12.2, 0.38, 2.6);
  const bridgeDeck = new THREE.Mesh(bridgeDeckGeo, mats.woodWeathered);
  bridgeDeck.position.set(0, 4.55, 0);
  gatehouse.add(bridgeDeck);

  // Archway knee braces under the bridge
  const braceGeo = new THREE.BoxGeometry(2.4, 0.28, 0.28);
  for (const side of [-1, 1]) {
    for (const cz of [-0.9, 0.9]) {
      const brace = new THREE.Mesh(braceGeo, mats.woodOak);
      brace.position.set(side * 2.8, 3.85, cz);
      brace.rotation.z = -side * 0.52;
      gatehouse.add(brace);
    }
  }

  // Front and rear crenellated breastwork along the overhead bridge
  const parapetGeo = new THREE.BoxGeometry(12.2, 0.85, 0.22);
  const merlonGeo = new THREE.BoxGeometry(0.85, 0.58, 0.24);
  for (const cz of [-1.18, 1.18]) {
    const pWall = new THREE.Mesh(parapetGeo, mats.woodOak);
    pWall.position.set(0, 5.12, cz);
    gatehouse.add(pWall);

    for (let mx = -5.2; mx <= 5.2; mx += 1.72) {
      const merlon = new THREE.Mesh(merlonGeo, mats.woodWeathered);
      merlon.position.set(mx, 5.82, cz);
      gatehouse.add(merlon);
    }
  }

  // Heavy iron-strapped double oak gate leaves (angled slightly open as if under siege)
  const doorGeo = new THREE.BoxGeometry(2.8, 3.9, 0.24);
  const strapGeo = new THREE.BoxGeometry(2.75, 0.18, 0.28);
  for (const side of [-1, 1]) {
    const doorGroup = new THREE.Group();
    const door = new THREE.Mesh(doorGeo, mats.woodWeathered);
    door.position.x = -side * 1.4;
    doorGroup.add(door);

    for (const sy of [-1.2, 0, 1.2]) {
      const strap = new THREE.Mesh(strapGeo, mats.darkIron);
      strap.position.set(-side * 1.4, sy, 0);
      doorGroup.add(strap);
    }

    doorGroup.position.set(side * 3.4, 2.15, 0.2);
    doorGroup.rotation.y = side * 0.58; // Angled slightly inward
    gatehouse.add(doorGroup);
  }

  return mergeStaticMeshesByMaterial(gatehouse, { castShadow: true, receiveShadow: true });
}

/**
 * Constructs a multi-story wooden siege watchtower with stone base berm, corner posts,
 * weathered X-bracing, planked archer platform, crenellated parapet, ladder, and roof banner.
 */
function createWatchtower(mats, banners, faction = 'saracen') {
  const tower = new THREE.Group();
  const w = 3.8;
  const h = 6.2;
  const halfW = w * 0.5;

  // Stone masonry foundation plinth so tower never floats on hillside slopes
  const plinthGeo = new THREE.BoxGeometry(w + 0.9, 1.2, w + 0.9);
  const plinth = new THREE.Mesh(plinthGeo, mats.stoneMasonry);
  plinth.position.y = 0.1;
  tower.add(plinth);

  // 4 heavy corner timber posts
  const postGeo = new THREE.CylinderGeometry(0.22, 0.26, h + 1.6, 8);
  const corners = [
    [-halfW, -halfW],
    [halfW, -halfW],
    [-halfW, halfW],
    [halfW, halfW],
  ];
  for (const [cx, cz] of corners) {
    const post = new THREE.Mesh(postGeo, mats.woodOak);
    post.position.set(cx, (h + 1.6) * 0.5 - 0.4, cz);
    tower.add(post);
  }

  // Horizontal frame beams & weathered X-bracing on two stories
  const hBeamGeo = new THREE.BoxGeometry(w + 0.34, 0.22, 0.22);
  const braceLen = Math.hypot(w, 2.7);
  const braceGeo = new THREE.BoxGeometry(braceLen, 0.15, 0.15);
  const bracketGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);

  for (const levelY of [2.6, 5.2]) {
    for (const [cx, cz] of corners) {
      const bracket = new THREE.Mesh(bracketGeo, mats.darkIron);
      bracket.position.set(cx, levelY, cz);
      tower.add(bracket);
    }

    for (const sideZ of [-halfW, halfW]) {
      const beam = new THREE.Mesh(hBeamGeo, mats.woodWeathered);
      beam.position.set(0, levelY, sideZ);
      tower.add(beam);

      for (const sign of [-1, 1]) {
        const brace = new THREE.Mesh(braceGeo, mats.woodWeathered);
        brace.position.set(0, levelY - 1.35, sideZ);
        brace.rotation.z = sign * 0.62;
        tower.add(brace);
      }
    }
    for (const sideX of [-halfW, halfW]) {
      const beam = new THREE.Mesh(hBeamGeo, mats.woodWeathered);
      beam.rotation.y = Math.PI / 2;
      beam.position.set(sideX, levelY, 0);
      tower.add(beam);

      for (const sign of [-1, 1]) {
        const brace = new THREE.Mesh(braceGeo, mats.woodWeathered);
        brace.rotation.y = Math.PI / 2;
        brace.position.set(sideX, levelY - 1.35, 0);
        brace.rotation.x = sign * 0.62;
        tower.add(brace);
      }
    }
  }

  // Planked archer deck platform at y = 5.25
  const deckGeo = new THREE.BoxGeometry(w + 0.55, 0.24, w + 0.55);
  const deck = new THREE.Mesh(deckGeo, mats.woodWeathered);
  deck.position.y = 5.25;
  tower.add(deck);

  // Crenellated wooden parapet walls around the top platform
  const parapetWallGeo = new THREE.BoxGeometry(w + 0.6, 0.72, 0.18);
  const merlonGeo = new THREE.BoxGeometry(0.68, 0.52, 0.2);

  for (let side = 0; side < 4; side++) {
    const pGroup = new THREE.Group();
    const baseWall = new THREE.Mesh(parapetWallGeo, mats.woodOak);
    baseWall.position.set(0, 5.72, halfW + 0.22);
    pGroup.add(baseWall);

    for (const mx of [-1.45, 0, 1.45]) {
      const merlon = new THREE.Mesh(merlonGeo, mats.woodWeathered);
      merlon.position.set(mx, 6.32, halfW + 0.22);
      pGroup.add(merlon);
    }

    const shieldMat = faction === 'crusader' ? mats.crusaderShield : mats.saracenShield;
    const shieldGeo =
      faction === 'crusader'
        ? new THREE.BoxGeometry(0.62, 0.82, 0.06)
        : new THREE.CylinderGeometry(0.42, 0.42, 0.06, 16);
    for (const sx of [-0.85, 0.85]) {
      const sh = new THREE.Mesh(shieldGeo, shieldMat);
      if (faction !== 'crusader') sh.rotation.x = Math.PI / 2;
      sh.position.set(sx, 5.72, halfW + 0.34);
      pGroup.add(sh);
    }

    pGroup.rotation.y = (side * Math.PI) / 2;
    tower.add(pGroup);
  }

  // Wooden access ladder leaning against rear (-Z)
  const ladderGroup = new THREE.Group();
  const railGeo = new THREE.CylinderGeometry(0.05, 0.05, 5.8, 6);
  const rungGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.75, 6);
  rungGeo.rotateZ(Math.PI / 2);

  for (const lx of [-0.35, 0.35]) {
    const rail = new THREE.Mesh(railGeo, mats.woodWeathered);
    rail.position.x = lx;
    ladderGroup.add(rail);
  }
  for (let ry = -2.4; ry <= 2.4; ry += 0.48) {
    const rung = new THREE.Mesh(rungGeo, mats.woodOak);
    rung.position.y = ry;
    ladderGroup.add(rung);
  }
  ladderGroup.position.set(0, 2.65, -halfW - 0.68);
  ladderGroup.rotation.x = 0.22;
  tower.add(ladderGroup);

  // Merge all static watchtower geometry before attaching the wind-animated roof banner
  mergeStaticMeshesByMaterial(tower, { castShadow: true, receiveShadow: true });

  const roofBanner = createWarBanner(mats, faction, 4.2);
  roofBanner.group.position.set(halfW, 5.35, halfW);
  tower.add(roofBanner.group);
  banners.push(roofBanner);

  return tower;
}

/**
 * Constructs a wind-animated Crusader or Saracen war standard and registers it with registerWindCloth.
 */
function createWarBanner(mats, faction = 'crusader', poleHeight = 5.4) {
  const group = new THREE.Group();

  const poleGeo = new THREE.CylinderGeometry(0.055, 0.075, poleHeight, 8);
  const pole = new THREE.Mesh(poleGeo, mats.woodOak);
  pole.position.y = poleHeight * 0.5;
  group.add(pole);

  const finial = new THREE.Group();
  finial.position.y = poleHeight + 0.18;
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), mats.gildedBrass);
  finial.add(orb);

  if (faction === 'crusader' || faction === 'companion') {
    const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.06), mats.gildedBrass);
    const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.06), mats.gildedBrass);
    vBar.position.y = 0.22;
    hBar.position.y = 0.24;
    finial.add(vBar, hBar);
  } else {
    const crescent = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.038, 8, 16, Math.PI * 1.45),
      mats.gildedBrass
    );
    crescent.position.y = 0.24;
    crescent.rotation.z = Math.PI * 0.78;
    finial.add(crescent);
  }
  group.add(finial);

  const flagW = 1.95;
  const flagH = 1.15;
  const flagGeo = new THREE.PlaneGeometry(flagW, flagH, 14, 8);
  flagGeo.translate(flagW * 0.5 + 0.06, 0, 0);

  const pos = flagGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const normX = Math.max(0, (vx - 0.06) / flagW);
    const taper = 1.0 - normX * 0.25;
    pos.setY(i, vy * taper);
  }
  flagGeo.computeVertexNormals();

  const flagMat =
    faction === 'crusader'
      ? mats.crusaderSurcoat
      : faction === 'companion'
      ? mats.companionSurcoat
      : mats.saracenRoyalTunic;

  const flagMesh = new THREE.Mesh(flagGeo, flagMat);
  flagMesh.position.y = poleHeight - flagH * 0.62;
  flagMesh.castShadow = true;
  group.add(flagMesh);

  registerWindCloth(flagMesh, 'left', 0.14, 5.2);

  return { group, flagMesh, faction };
}

const tentMaterialCache = new Map();
function getPavilionMaterial(faction = 'crusader') {
  if (tentMaterialCache.has(faction)) return tentMaterialCache.get(faction);
  const canopyTex = getPavilionTexture(faction);
  const mat = new THREE.MeshStandardMaterial({
    map: canopyTex,
    roughness: 0.78,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  tentMaterialCache.set(faction, mat);
  return mat;
}

/**
 * Constructs a rich octagonal/conical medieval command pavilion tent with striped canopy,
 * dagged eaves trim, center pole, gilded finial, guy ropes, and camp supplies.
 */
function createPavilionTent(mats, faction = 'crusader', radius = 3.8, height = 5.2) {
  const group = new THREE.Group();
  const canopyMat = getPavilionMaterial(faction);

  const wallH = height * 0.46;
  const wallGeo = new THREE.CylinderGeometry(radius, radius * 1.06, wallH, 12, 1, true);
  const walls = new THREE.Mesh(wallGeo, canopyMat);
  walls.position.y = wallH * 0.5;
  group.add(walls);

  const roofH = height * 0.54;
  const roofGeo = new THREE.ConeGeometry(radius * 1.08, roofH, 12);
  const roof = new THREE.Mesh(roofGeo, canopyMat);
  roof.position.y = wallH + roofH * 0.5 - 0.05;
  group.add(roof);

  const valanceGeo = new THREE.CylinderGeometry(radius * 1.09, radius * 1.11, 0.34, 12);
  const valanceMat = faction === 'crusader' ? mats.capeCrimson : mats.saracenTurquoiseTunic;
  const valance = new THREE.Mesh(valanceGeo, valanceMat);
  valance.position.y = wallH - 0.08;
  group.add(valance);

  const mastGeo = new THREE.CylinderGeometry(0.1, 0.12, height + 0.9, 8);
  const mast = new THREE.Mesh(mastGeo, mats.woodOak);
  mast.position.y = (height + 0.9) * 0.5;
  group.add(mast);

  const finialOrb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), mats.gildedBrass);
  finialOrb.position.y = height + 0.95;
  group.add(finialOrb);

  const ropeGeo = new THREE.CylinderGeometry(0.015, 0.015, 2.2, 4);
  const stakeGeo = new THREE.CylinderGeometry(0.04, 0.02, 0.5, 5);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.25;
    const rx = Math.cos(a) * (radius + 0.75);
    const rz = Math.sin(a) * (radius + 0.75);

    const rope = new THREE.Mesh(ropeGeo, mats.leatherSaddle);
    rope.position.set(rx * 0.92, wallH * 0.52, rz * 0.92);
    rope.rotation.y = -a + Math.PI / 2;
    rope.rotation.x = 0.58;
    group.add(rope);

    const stake = new THREE.Mesh(stakeGeo, mats.woodSapwoodTip);
    stake.position.set(rx * 1.08, 0.15, rz * 1.08);
    stake.rotation.z = 0.25;
    group.add(stake);
  }

  const barrelGeo = new THREE.CylinderGeometry(0.34, 0.38, 0.86, 10);
  const crateGeo = new THREE.BoxGeometry(0.82, 0.74, 0.82);

  const b1 = new THREE.Mesh(barrelGeo, mats.woodOak);
  b1.position.set(radius + 0.65, 0.43, 0.6);

  const b2 = new THREE.Mesh(barrelGeo, mats.woodOak);
  b2.position.set(radius + 0.85, 0.43, -0.25);

  const crate = new THREE.Mesh(crateGeo, mats.woodWeathered);
  crate.position.set(-radius - 0.6, 0.37, 0.5);
  crate.rotation.y = 0.35;

  group.add(b1, b2, crate);
  return mergeStaticMeshesByMaterial(group, { castShadow: true, receiveShadow: true });
}

/**
 * Constructs a spoked medieval wooden wheel.
 */
function createSpokedWheel(mats, radius = 0.72, thickness = 0.14) {
  const wheel = new THREE.Group();

  const rimGeo = new THREE.TorusGeometry(radius, thickness * 0.55, 8, 20);
  const rim = new THREE.Mesh(rimGeo, mats.woodOak);
  wheel.add(rim);

  const ironTireGeo = new THREE.TorusGeometry(radius + 0.02, thickness * 0.58, 6, 20);
  const ironTire = new THREE.Mesh(ironTireGeo, mats.darkIron);
  wheel.add(ironTire);

  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, thickness * 1.6, 10);
  hubGeo.rotateX(Math.PI / 2);
  const hub = new THREE.Mesh(hubGeo, mats.darkIron);
  wheel.add(hub);

  const spokeGeo = new THREE.CylinderGeometry(0.038, 0.045, radius * 1.9, 6);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(spokeGeo, mats.woodWeathered);
    spoke.rotation.z = (i * Math.PI) / 4;
    wheel.add(spoke);
  }

  return mergeStaticMeshesByMaterial(wheel, { castShadow: true, receiveShadow: true });
}

/**
 * Constructs an overturned or battle-damaged medieval supply wagon with spoked wheels,
 * planked bed, side rails, and spilled barrels.
 */
function createSupplyWagon(mats, overturned = true) {
  const group = new THREE.Group();
  const wagonBody = new THREE.Group();

  const bedGeo = new THREE.BoxGeometry(1.9, 0.18, 3.6);
  const bed = new THREE.Mesh(bedGeo, mats.woodWeathered);
  bed.position.y = 0.68;
  wagonBody.add(bed);

  const railGeo = new THREE.BoxGeometry(0.12, 0.65, 3.6);
  for (const sx of [-0.9, 0.9]) {
    const rail = new THREE.Mesh(railGeo, mats.woodOak);
    rail.position.set(sx, 1.08, 0);
    wagonBody.add(rail);
  }

  const wheelOffsets = [
    [-1.06, 0.65, -1.15],
    [1.06, 0.65, -1.15],
    [-1.06, 0.65, 1.15],
    [1.06, 0.65, 1.15],
  ];
  for (let i = 0; i < wheelOffsets.length; i++) {
    const [wx, wy, wz] = wheelOffsets[i];
    const w = createSpokedWheel(mats, 0.65, 0.13);
    w.rotation.y = Math.PI / 2;
    if (overturned && i === 0) {
      w.position.set(wx - 0.85, 0.12, wz + 0.4);
      w.rotation.set(Math.PI * 0.46, 0.2, 0.3);
      group.add(w);
    } else {
      w.position.set(wx, wy, wz);
      wagonBody.add(w);
    }
  }

  const barrelGeo = new THREE.CylinderGeometry(0.32, 0.36, 0.82, 10);
  const b1 = new THREE.Mesh(barrelGeo, mats.woodOak);
  b1.position.set(0.15, 1.12, -0.4);
  b1.rotation.z = 1.35;
  wagonBody.add(b1);

  if (overturned) {
    wagonBody.rotation.z = 0.38;
    wagonBody.rotation.x = -0.12;
    wagonBody.position.y = -0.18;
  }
  group.add(wagonBody);
  return mergeStaticMeshesByMaterial(group, { castShadow: true, receiveShadow: true });
}

/**
 * Constructs the Escortable Siege Battering Ram (`siegeRam`) positioned on the central road:
 * heavy wheeled timber frame, iron-plated pitched roof, 4 spoked wheels, and chain-suspended
 * iron-capped battering log with sculpted bronze ram's head nozzle.
 */
function createSiegeBatteringRam(mats, getTerrainHeight, colliders) {
  const siegeRam = new THREE.Group();
  siegeRam.name = 'SiegeBatteringRam';
  siegeRam.userData.noMerge = true;

  const chassisGroup = new THREE.Group();

  // 1. Heavy oak chassis base beams
  const sideBeamGeo = new THREE.BoxGeometry(0.32, 0.34, 5.8);
  const crossBeamGeo = new THREE.BoxGeometry(2.9, 0.3, 0.32);

  for (const sx of [-1.28, 1.28]) {
    const beam = new THREE.Mesh(sideBeamGeo, mats.woodOak);
    beam.position.set(sx, 0.82, 0);
    chassisGroup.add(beam);
  }
  for (const sz of [-2.5, 0, 2.5]) {
    const cBeam = new THREE.Mesh(crossBeamGeo, mats.woodWeathered);
    cBeam.position.set(0, 0.82, sz);
    chassisGroup.add(cBeam);
  }

  // 2. Upright A-frame posts supporting the roof canopy
  const postGeo = new THREE.CylinderGeometry(0.16, 0.19, 2.6, 8);
  for (const sx of [-1.22, 1.22]) {
    for (const sz of [-2.1, 0, 2.1]) {
      const post = new THREE.Mesh(postGeo, mats.woodOak);
      post.position.set(sx, 2.05, sz);
      post.rotation.z = sx < 0 ? -0.14 : 0.14;
      chassisGroup.add(post);
    }
  }

  // 3. Pitched wooden roof plated in dark iron sheets
  const roofSlopeGeo = new THREE.BoxGeometry(1.85, 0.14, 6.2);
  const ironPlateGeo = new THREE.BoxGeometry(1.75, 0.04, 5.9);

  for (const side of [-1, 1]) {
    const slopeGroup = new THREE.Group();
    const woodSlope = new THREE.Mesh(roofSlopeGeo, mats.woodWeathered);
    const ironSlope = new THREE.Mesh(ironPlateGeo, mats.darkIron);
    ironSlope.position.y = 0.08;

    slopeGroup.add(woodSlope, ironSlope);
    slopeGroup.position.set(side * 0.74, 3.45, 0);
    slopeGroup.rotation.z = -side * 0.56;
    chassisGroup.add(slopeGroup);
  }

  const ridgeBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 6.4, 8), mats.darkIron);
  ridgeBeam.rotation.x = Math.PI / 2;
  ridgeBeam.position.set(0, 3.92, 0);
  chassisGroup.add(ridgeBeam);

  mergeStaticMeshesByMaterial(chassisGroup, { castShadow: true, receiveShadow: true });
  siegeRam.add(chassisGroup);

  // 4. Four large spoked iron-shod wheels (each pre-merged by material)
  const wheels = [];
  const wheelRadius = 0.78;
  const wheelCoords = [
    [-1.52, wheelRadius, -1.85],
    [1.52, wheelRadius, -1.85],
    [-1.52, wheelRadius, 1.85],
    [1.52, wheelRadius, 1.85],
  ];
  for (const [wx, wy, wz] of wheelCoords) {
    const w = createSpokedWheel(mats, wheelRadius, 0.18);
    w.userData.noMerge = true;
    w.rotation.y = Math.PI / 2;
    w.position.set(wx, wy, wz);
    siegeRam.add(w);
    wheels.push(w);
  }

  // 5. Chain-suspended massive battering log with sculpted bronze/iron Ram's Head nozzle
  const ramAssembly = new THREE.Group();
  ramAssembly.userData.noMerge = true;
  ramAssembly.position.set(0, 1.85, 0);

  const mainLogGeo = new THREE.CylinderGeometry(0.32, 0.36, 6.4, 12);
  mainLogGeo.rotateX(Math.PI / 2);
  const mainLog = new THREE.Mesh(mainLogGeo, mats.woodOak);
  ramAssembly.add(mainLog);

  const bandGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.18, 12);
  bandGeo.rotateX(Math.PI / 2);
  for (const bz of [-2.4, -1.1, 0.4, 1.8]) {
    const band = new THREE.Mesh(bandGeo, mats.darkIron);
    band.position.z = bz;
    ramAssembly.add(band);
  }

  const ramHead = new THREE.Group();
  ramHead.position.set(0, 0, -3.35);

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.35, 0.55, 12).rotateX(Math.PI / 2),
    mats.darkIron
  );
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.58, 0.72), mats.gildedBrass);
  skull.position.z = -0.36;

  const snout = new THREE.Mesh(
    new THREE.ConeGeometry(0.38, 0.65, 6).rotateX(-Math.PI / 2),
    mats.gildedBrass
  );
  snout.position.z = -0.78;

  const hornGeo = new THREE.TorusGeometry(0.26, 0.085, 8, 14, Math.PI * 1.55);
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(hornGeo, mats.gildedBrass);
    horn.position.set(side * 0.34, 0.08, -0.32);
    horn.rotation.y = side * 0.35;
    ramHead.add(horn);
  }

  ramHead.add(collar, skull, snout);
  ramAssembly.add(ramHead);

  const chainGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.85, 6);
  for (const cz of [-1.6, 1.6]) {
    for (const cx of [-0.32, 0.32]) {
      const chain = new THREE.Mesh(chainGeo, mats.chainmail);
      chain.position.set(cx, 0.92, cz);
      chain.rotation.z = cx < 0 ? -0.18 : 0.18;
      ramAssembly.add(chain);
    }
  }

  mergeStaticMeshesByMaterial(ramAssembly, { castShadow: true, receiveShadow: true });
  siegeRam.add(ramAssembly);

  const startX = -12;
  const startZ = 25;
  const startY = getTerrainHeight(startX, startZ);
  siegeRam.position.set(startX, startY, startZ);

  const ramCollider = addCollider(colliders, startX, startY, startZ, 3.1, 'siegeRam', 'Siege Battering Ram');

  siegeRam.mesh = siegeRam;
  siegeRam.group = siegeRam;
  siegeRam.wheels = wheels;
  siegeRam.ramAssembly = ramAssembly;
  siegeRam.collider = ramCollider;
  siegeRam.startZ = startZ;
  siegeRam.targetZ = -48;
  siegeRam.speed = 2.6;
  siegeRam.swingPhase = 0;
  siegeRam.progress = 0;
  siegeRam.reachedTarget = false;

  siegeRam.advance = function (dt, speedMultiplier = 1.0) {
    if (siegeRam.position.z <= siegeRam.targetZ) {
      siegeRam.reachedTarget = true;
      siegeRam.swingPhase += dt * 5.2;
      ramAssembly.position.z = Math.sin(siegeRam.swingPhase) * 0.55;
      return siegeRam.progress;
    }

    const moveDist = siegeRam.speed * speedMultiplier * dt;
    siegeRam.position.z = Math.max(siegeRam.targetZ, siegeRam.position.z - moveDist);
    const totalSpan = siegeRam.startZ - siegeRam.targetZ;
    siegeRam.progress = Math.min(1, (siegeRam.startZ - siegeRam.position.z) / totalSpan);
    siegeRam.position.x = THREE.MathUtils.lerp(startX, 0, siegeRam.progress * 0.85);

    const hCurr = getTerrainHeight(siegeRam.position.x, siegeRam.position.z);
    const hAhead = getTerrainHeight(siegeRam.position.x, siegeRam.position.z - 2.0);
    siegeRam.position.y = hCurr;
    siegeRam.rotation.x = Math.atan2(hAhead - hCurr, 2.0) * 0.65;

    const wheelRot = moveDist / wheelRadius;
    for (const w of wheels) {
      w.rotation.x -= wheelRot;
    }

    siegeRam.swingPhase += dt * 3.8;
    ramAssembly.position.z = Math.sin(siegeRam.swingPhase) * 0.28;

    ramCollider.x = siegeRam.position.x;
    ramCollider.y = siegeRam.position.y;
    ramCollider.z = siegeRam.position.z;
    ramCollider.position.copy(siegeRam.position);

    return siegeRam.progress;
  };

  return siegeRam;
}

/**
 * Constructs the Capturable Hilltop Standard (`hilltopStandard`) at (0, z = -65):
 * stone/timber octagonal dais, tall ornate flagpole, golden finial, glowing ground capture ring,
 * and huge wind-animated banner.
 */
function createHilltopStandard(mats, getTerrainHeight, colliders, banners) {
  const gx = 0;
  const gz = -65;
  const gy = getTerrainHeight(gx, gz);

  const standard = new THREE.Group();
  standard.name = 'HilltopStandard';
  standard.userData.noMerge = true;
  standard.position.set(gx, gy, gz);

  const lowerDais = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.8, 0.45, 8),
    mats.stoneMasonry
  );
  lowerDais.position.y = 0.22;

  const upperDais = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 2.4, 0.48, 8),
    mats.stoneMasonry
  );
  upperDais.position.y = 0.68;

  const timberTrim = new THREE.Mesh(
    new THREE.CylinderGeometry(2.18, 2.18, 0.14, 8),
    mats.woodWeathered
  );
  timberTrim.position.y = 0.92;
  standard.add(lowerDais, upperDais, timberTrim);

  const bollardGeo = new THREE.CylinderGeometry(0.14, 0.17, 0.95, 6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const bollard = new THREE.Mesh(bollardGeo, mats.woodOak);
    bollard.position.set(Math.cos(a) * 3.1, 0.62, Math.sin(a) * 3.1);
    standard.add(bollard);
  }

  const poleH = 8.8;
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.14, poleH, 10),
    mats.woodOak
  );
  mast.position.y = 0.9 + poleH * 0.5;
  standard.add(mast);

  for (const ry of [1.4, 4.2, 7.2, 9.5]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.18, 10), mats.gildedBrass);
    ring.position.y = ry;
    standard.add(ring);
  }

  const finial = new THREE.Group();
  finial.position.y = 0.9 + poleH + 0.25;
  const sunSphere = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 14), mats.gildedBrass);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.78, 0.1), mats.gildedBrass);
  crossV.position.y = 0.42;
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.1, 0.1), mats.gildedBrass);
  crossH.position.y = 0.46;
  finial.add(sunSphere, crossV, crossH);
  standard.add(finial);

  // Merge static dais, bollards, mast, and finial
  mergeStaticMeshesByMaterial(standard, { castShadow: true, receiveShadow: true });

  // Huge Wind-Animated Sovereign Standard Banner
  const flagW = 3.2;
  const flagH = 1.85;
  const flagGeo = new THREE.PlaneGeometry(flagW, flagH, 18, 10);
  flagGeo.translate(flagW * 0.5 + 0.1, 0, 0);

  const pos = flagGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const normX = Math.max(0, (vx - 0.1) / flagW);
    pos.setY(i, vy * (1.0 - normX * 0.22));
  }
  flagGeo.computeVertexNormals();

  const flagMesh = new THREE.Mesh(flagGeo, mats.saracenRoyalTunic);
  flagMesh.position.y = 0.9 + poleH - flagH * 0.58;
  flagMesh.castShadow = true;
  standard.add(flagMesh);

  registerWindCloth(flagMesh, 'left', 0.16, 5.2);
  banners.push({ group: standard, flagMesh, faction: 'objective' });

  // Glowing Tactical Capture Ring on the Ground
  const ringGeo = new THREE.RingGeometry(5.6, 6.2, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xebb844,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  const captureRing = new THREE.Mesh(ringGeo, ringMat);
  captureRing.userData.noMerge = true;
  captureRing.position.y = 0.14;
  standard.add(captureRing);

  const innerRingGeo = new THREE.RingGeometry(4.8, 5.05, 32);
  innerRingGeo.rotateX(-Math.PI / 2);
  const innerRingMat = new THREE.MeshBasicMaterial({
    color: 0xffe49e,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
  innerRing.userData.noMerge = true;
  innerRing.position.y = 0.15;
  standard.add(innerRing);

  addCollider(colliders, gx, gy, gz, 2.2, 'hilltopStandard', 'Hilltop Standard Dais');

  standard.mesh = standard;
  standard.group = standard;
  standard.flagMesh = flagMesh;
  standard.finial = finial;
  standard.captureRing = captureRing;
  standard.innerRing = innerRing;
  standard.ringMat = ringMat;
  standard.captureRadius = 6.2;
  standard.owner = 'saracen';
  standard.captureProgress = 0;

  standard.setCaptureState = function (progress, owner = null) {
    standard.captureProgress = Math.max(0, Math.min(1, progress));
    if (owner) standard.owner = owner;
    if (standard.captureProgress >= 0.99 || standard.owner === 'crusader') {
      flagMesh.material = mats.companionSurcoat;
      ringMat.color.setHex(0x52a8ff);
    } else if (standard.captureProgress > 0.05) {
      ringMat.color.setHex(0xffd25a);
    } else {
      flagMesh.material = mats.saracenRoyalTunic;
      ringMat.color.setHex(0xe04832);
    }
  };

  return standard;
}

// Shared materials and geometries for the 10 braziers so they don't duplicate allocations
let sharedBrazierAssets = null;
function getBrazierAssets() {
  if (sharedBrazierAssets) return sharedBrazierAssets;

  const coalGeo = new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const coalMat = new THREE.MeshStandardMaterial({
    color: 0x3a1004,
    emissive: 0xff3b00,
    emissiveIntensity: 2.2,
    roughness: 0.9,
  });

  const haloGeo = new THREE.SphereGeometry(0.36, 10, 8);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xff8822,
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const tongueGeo = new THREE.ConeGeometry(0.18, 0.78, 5);
  tongueGeo.translate(0, 0.36, 0);

  const outerFlameMat = new THREE.MeshBasicMaterial({
    color: 0xff5a0a,
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
  });
  const midFlameMat = new THREE.MeshBasicMaterial({
    color: 0xff9e1b,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  const coreFlameMat = new THREE.MeshBasicMaterial({
    color: 0xfff39e,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });

  sharedBrazierAssets = {
    coalGeo,
    coalMat,
    haloGeo,
    haloMat,
    tongueGeo,
    outerFlameMat,
    midFlameMat,
    coreFlameMat,
  };
  return sharedBrazierAssets;
}

/**
 * Constructs a forged-iron tripod brazier with glowing coals, a soft additive glow halo,
 * and a 5-tongue multi-layered dancing flame cluster (zero PointLights for 60 FPS!).
 */
function createBrazier(mats, x, y, z, seed = 1) {
  const assets = getBrazierAssets();
  const group = new THREE.Group();
  group.position.set(x, y, z);

  // Tripod forged-iron legs & fire basket (merged into static props)
  const legGeo = new THREE.CylinderGeometry(0.045, 0.06, 1.35, 6);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(legGeo, mats.darkIron);
    leg.position.set(Math.cos(a) * 0.28, 0.58, Math.sin(a) * 0.28);
    leg.rotation.y = -a;
    leg.rotation.z = 0.26;
    group.add(leg);
  }

  const bowlGeo = new THREE.CylinderGeometry(0.48, 0.24, 0.42, 10);
  const bowl = new THREE.Mesh(bowlGeo, mats.darkIron);
  bowl.position.y = 1.15;
  group.add(bowl);

  const coals = new THREE.Mesh(assets.coalGeo, assets.coalMat);
  coals.position.y = 1.24;
  group.add(coals);

  // Soft warm emissive halo sphere (replaces expensive scene-wide PointLight)
  const halo = new THREE.Mesh(assets.haloGeo, assets.haloMat);
  halo.userData.noMerge = true;
  halo.position.y = 1.58;
  group.add(halo);

  // 5 twisted/tilted multi-tongue flame blades
  const flameCluster = new THREE.Group();
  flameCluster.userData.noMerge = true;
  flameCluster.position.y = 1.28;

  const tongueSpecs = [
    { mat: assets.coreFlameMat, ox: 0.0, oz: 0.0, sx: 0.85, sy: 1.15, tiltX: 0.05, tiltZ: -0.04 },
    { mat: assets.midFlameMat, ox: 0.11, oz: 0.06, sx: 0.92, sy: 0.95, tiltX: 0.22, tiltZ: -0.25 },
    { mat: assets.midFlameMat, ox: -0.1, oz: -0.07, sx: 0.88, sy: 0.9, tiltX: -0.2, tiltZ: 0.24 },
    { mat: assets.outerFlameMat, ox: -0.06, oz: 0.12, sx: 1.05, sy: 0.82, tiltX: 0.28, tiltZ: 0.18 },
    { mat: assets.outerFlameMat, ox: 0.08, oz: -0.11, sx: 1.0, sy: 0.78, tiltX: -0.26, tiltZ: -0.2 },
  ];

  const tongues = [];
  for (let t = 0; t < tongueSpecs.length; t++) {
    const spec = tongueSpecs[t];
    const m = new THREE.Mesh(assets.tongueGeo, spec.mat);
    m.position.set(spec.ox, 0, spec.oz);
    m.rotation.set(spec.tiltX, (t * Math.PI * 2) / 5, spec.tiltZ);
    m.scale.set(spec.sx, spec.sy, spec.sx);
    flameCluster.add(m);
    tongues.push({ mesh: m, spec, idx: t });
  }
  group.add(flameCluster);

  return {
    group,
    halo,
    flameCluster,
    tongues,
    outerFlame: tongues[3].mesh,
    innerFlame: tongues[0].mesh,
    coalMat: assets.coalMat,
    light: { intensity: 2.6, position: new THREE.Vector3(0, 1.85, 0) },
    phase: seed * 2.17,
  };
}

/**
 * Creates all medieval battlefield fortifications, watchtowers, Northern Siege Gatehouse,
 * pavilion camps, overturned supply wagons, escortable Siege Battering Ram,
 * capturable Hilltop Standard, 10 burning iron braziers, and 18 wind-animated war banners.
 */
export function createPropsAndFortifications(scene, getTerrainHeight) {
  const mats = getMaterials();
  const propsGroup = new THREE.Group();
  propsGroup.name = 'PropsAndFortifications';

  const colliders = [];
  const braziers = [];
  const banners = [];

  // ============================================================================
  // 1. TIMBER SIEGE PALISADES, NORTHERN GATEHOUSE & CHEVAUX-DE-FRISE
  // ============================================================================
  const palisadePlacements = [
    // Northern Hilltop Outpost defensive perimeter (flanking the central gatehouse at z = -48)
    { x: -10.2, z: -48, rotY: 0.14, len: 7.2, stakes: true },
    { x: -17.5, z: -51.5, rotY: 0.52, len: 7.2, stakes: true },
    { x: 10.2, z: -48, rotY: -0.14, len: 7.2, stakes: true },
    { x: 17.5, z: -51.5, rotY: -0.52, len: 7.2, stakes: true },
    { x: -16.0, z: -78, rotY: Math.PI - 0.35, len: 7.2, stakes: false },
    { x: 16.0, z: -78, rotY: Math.PI + 0.35, len: 7.2, stakes: false },

    // Eastern Archer Ridge breastworks (facing West toward central valley)
    { x: 48, z: -26, rotY: -Math.PI * 0.48, len: 7.2, stakes: true },
    { x: 49, z: -12, rotY: -Math.PI * 0.52, len: 7.2, stakes: true },
    { x: 48, z: 6, rotY: -Math.PI * 0.48, len: 7.2, stakes: true },
    { x: 47, z: 20, rotY: -Math.PI * 0.53, len: 7.2, stakes: true },

    // Western Siege & Palisade Ridge breastworks (facing East toward central valley)
    { x: -48, z: -22, rotY: Math.PI * 0.48, len: 7.2, stakes: true },
    { x: -49, z: -6, rotY: Math.PI * 0.52, len: 7.2, stakes: true },
    { x: -48, z: 12, rotY: Math.PI * 0.47, len: 7.2, stakes: true },

    // Southern Crusader Forward Camp palisades (flanking the road at z ~ 56)
    { x: -16, z: 56, rotY: Math.PI - 0.12, len: 7.2, stakes: true },
    { x: 24, z: 56, rotY: Math.PI + 0.12, len: 7.2, stakes: true },
  ];

  for (const p of palisadePlacements) {
    const py = getTerrainHeight(p.x, p.z);
    const wall = createPalisadeSection(mats, p.len, p.stakes);
    wall.position.set(p.x, py - 0.18, p.z);
    wall.rotation.y = p.rotY;
    propsGroup.add(wall);

    const cosR = Math.cos(p.rotY);
    const sinR = Math.sin(p.rotY);
    for (const offset of [-1.8, 1.8]) {
      const cx = p.x + cosR * offset;
      const cz = p.z - sinR * offset;
      addCollider(colliders, cx, getTerrainHeight(cx, cz), cz, 1.65, 'palisade', 'Timber Palisade');
    }
  }

  // Imposing Northern Timber Siege Gatehouse at (0, z = -48)
  const gateY = getTerrainHeight(0, -48);
  const gatehouse = createSiegeGatehouse(mats);
  gatehouse.position.set(0, gateY - 0.15, -48);
  propsGroup.add(gatehouse);
  addCollider(colliders, -4.6, getTerrainHeight(-4.6, -48), -48, 1.85, 'gatehouse', 'Gatehouse West Pier');
  addCollider(colliders, 4.6, getTerrainHeight(4.6, -48), -48, 1.85, 'gatehouse', 'Gatehouse East Pier');

  // Standalone forward Chevaux-de-Frise anti-cavalry stake barriers
  const stakeBarriers = [
    { x: 39, z: -18, rotY: -Math.PI * 0.5 },
    { x: 39, z: 12, rotY: -Math.PI * 0.5 },
    { x: -39, z: -14, rotY: Math.PI * 0.5 },
    { x: -39, z: 14, rotY: Math.PI * 0.5 },
    { x: -8.5, z: -42, rotY: 0.15 },
    { x: 8.5, z: -42, rotY: -0.15 },
  ];
  for (const sb of stakeBarriers) {
    const sy = getTerrainHeight(sb.x, sb.z);
    const barrier = createChevauxDeFrise(mats, 4.2);
    barrier.position.set(sb.x, sy - 0.08, sb.z);
    barrier.rotation.y = sb.rotY;
    propsGroup.add(barrier);
    addCollider(colliders, sb.x, sy, sb.z, 1.7, 'stakes', 'Sharpened Stakes');
  }

  // ============================================================================
  // 2. TWO WOODEN SIEGE WATCHTOWERS AT (-42, z=-35) AND (45, z=-40)
  // ============================================================================
  const towerConfigs = [
    { x: -42, z: -35, rotY: 0.35, faction: 'crusader' },
    { x: 45, z: -40, rotY: -0.42, faction: 'saracen' },
  ];
  for (const tc of towerConfigs) {
    const ty = getTerrainHeight(tc.x, tc.z);
    const tower = createWatchtower(mats, banners, tc.faction);
    tower.position.set(tc.x, ty, tc.z);
    tower.rotation.y = tc.rotY;
    propsGroup.add(tower);
    addCollider(colliders, tc.x, ty, tc.z, 2.75, 'watchtower', 'Wooden Watchtower');
  }

  // ============================================================================
  // 3. MEDIEVAL PAVILION TENTS & COMMAND CAMPS (CRUSADER SOUTH & SARACEN NORTH)
  // ============================================================================
  const tentConfigs = [
    { x: -22, z: 70, faction: 'crusader', r: 4.2, h: 5.6, rotY: 0.4 },
    { x: -11, z: 79, faction: 'crusader', r: 3.5, h: 4.8, rotY: -0.2 },
    { x: 20, z: 68, faction: 'crusader', r: 4.2, h: 5.6, rotY: -0.5 },
    { x: 31, z: 77, faction: 'crusader', r: 3.5, h: 4.8, rotY: 0.3 },

    { x: -24, z: -84, faction: 'saracen', r: 4.3, h: 5.8, rotY: 2.6 },
    { x: 0, z: -91, faction: 'saracen', r: 4.8, h: 6.4, rotY: Math.PI },
    { x: 24, z: -84, faction: 'saracen', r: 4.3, h: 5.8, rotY: -2.6 },
  ];

  for (const t of tentConfigs) {
    const ty = getTerrainHeight(t.x, t.z);
    const pavilion = createPavilionTent(mats, t.faction, t.r, t.h);
    pavilion.position.set(t.x, ty - 0.1, t.z);
    pavilion.rotation.y = t.rotY;
    propsGroup.add(pavilion);
    addCollider(colliders, t.x, ty, t.z, t.r * 0.92, 'tent', 'Medieval Pavilion Tent');
  }

  // ============================================================================
  // 4. OVERTURNED SUPPLY WAGONS & BARRICADES
  // ============================================================================
  const wagonPlacements = [
    { x: -24, z: 12, rotY: 0.72, overturned: true },
    { x: 26, z: -8, rotY: -1.15, overturned: true },
    { x: -20, z: -24, rotY: 0.38, overturned: false },
    { x: 22, z: 24, rotY: 2.1, overturned: true },
  ];
  for (const wp of wagonPlacements) {
    const wy = getTerrainHeight(wp.x, wp.z);
    const wagon = createSupplyWagon(mats, wp.overturned);
    wagon.position.set(wp.x, wy, wp.z);
    wagon.rotation.y = wp.rotY;
    propsGroup.add(wagon);
    addCollider(colliders, wp.x, wy, wp.z, 1.85, 'wagon', 'Supply Wagon');
  }

  // ============================================================================
  // 5. ESCORTABLE SIEGE BATTERING RAM (x = -12, z = 25)
  // ============================================================================
  const siegeRam = createSiegeBatteringRam(mats, getTerrainHeight, colliders);
  propsGroup.add(siegeRam);

  // ============================================================================
  // 6. CAPTURABLE HILLTOP STANDARD AT (0, z = -65)
  // ============================================================================
  const hilltopStandard = createHilltopStandard(mats, getTerrainHeight, colliders, banners);
  propsGroup.add(hilltopStandard);

  // ============================================================================
  // 7. 10 BURNING IRON BRAZIERS WITH 5-TONGUE FLAMES & HALO
  // ============================================================================
  const brazierCoords = [
    [-4.8, -61.5],
    [4.8, -61.5],
    [-6.2, -46.2],
    [6.2, -46.2],
    [-38.5, -32.5],
    [41.5, -37.5],
    [46.0, -4.0],
    [-46.0, 2.0],
    [-11.5, 57.5],
    [18.5, 57.5],
  ];

  for (let i = 0; i < brazierCoords.length; i++) {
    const [bx, bz] = brazierCoords[i];
    const by = getTerrainHeight(bx, bz);
    const brazier = createBrazier(mats, bx, by, bz, i + 1);
    propsGroup.add(brazier.group);
    braziers.push(brazier);
    addCollider(colliders, bx, by, bz, 0.65, 'brazier', 'Burning Brazier');
  }

  // ============================================================================
  // 8. WIND-ANIMATED WAR STANDARDS (18 TOTAL BANNERS ACROSS RIDGES, CAMP & VALLEY)
  // ============================================================================
  const fieldBannerSpecs = [
    { x: -13, z: 54, faction: 'crusader', h: 5.8 },
    { x: 20, z: 54, faction: 'companion', h: 5.8 },
    { x: -26, z: 66, faction: 'crusader', h: 5.4 },
    { x: 25, z: 64, faction: 'crusader', h: 5.4 },
    { x: -6, z: 36, faction: 'companion', h: 5.2 },

    { x: -52, z: -26, faction: 'crusader', h: 5.6 },
    { x: -53, z: -8, faction: 'companion', h: 5.6 },
    { x: -51, z: 14, faction: 'crusader', h: 5.5 },

    { x: 53, z: -28, faction: 'saracen', h: 5.6 },
    { x: 54, z: -10, faction: 'saracen', h: 5.8 },
    { x: 53, z: 10, faction: 'saracen', h: 5.6 },
    { x: 51, z: 24, faction: 'saracen', h: 5.4 },

    { x: -7.5, z: -47.2, faction: 'saracen', h: 6.2 },
    { x: 7.5, z: -47.2, faction: 'saracen', h: 6.2 },
    { x: 0, z: -83, faction: 'saracen', h: 6.2 },
  ];

  for (const fb of fieldBannerSpecs) {
    const by = getTerrainHeight(fb.x, fb.z);
    const banner = createWarBanner(mats, fb.faction, fb.h);
    banner.group.position.set(fb.x, by - 0.1, fb.z);
    propsGroup.add(banner.group);
    banners.push(banner);
  }

  // Collapse all static fortification/prop meshes across the entire battlefield by material!
  mergeStaticMeshesByMaterial(propsGroup, { castShadow: true, receiveShadow: true });

  scene.add(propsGroup);

  /**
   * Frame update for dynamic props:
   * - Animates the 5-tongue flame clusters and glowing halos on all 10 braziers
   * - Pulses & rotates the Hilltop Standard ground capture rings
   * - Gently sways the suspended battering ram log on its iron chains
   */
  function update(dt, time) {
    for (let i = 0; i < braziers.length; i++) {
      const b = braziers[i];
      const t = time * 8.0 + b.phase;
      const flicker =
        Math.sin(t) * 0.45 +
        Math.cos(t * 2.3) * 0.3 +
        Math.sin(t * 4.1) * 0.25;

      b.light.intensity = 2.55 + flicker * 0.72;
      const haloScale = 1.0 + flicker * 0.18;
      b.halo.scale.set(haloScale, haloScale, haloScale);
      b.flameCluster.rotation.y = time * 1.8 + b.phase;

      for (let k = 0; k < b.tongues.length; k++) {
        const tg = b.tongues[k];
        const tk = t * (1.2 + k * 0.28) + k * 1.4;
        const w1 = Math.sin(tk);
        const w2 = Math.cos(tk * 1.7);
        tg.mesh.scale.set(
          tg.spec.sx * (1.0 - w1 * 0.14),
          tg.spec.sy * (1.0 + w1 * 0.28 + w2 * 0.12),
          tg.spec.sx * (1.0 + w2 * 0.14)
        );
        tg.mesh.rotation.x = tg.spec.tiltX + w1 * 0.18;
        tg.mesh.rotation.z = tg.spec.tiltZ + w2 * 0.18;
      }
    }

    if (hilltopStandard && hilltopStandard.captureRing) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 3.2);
      hilltopStandard.ringMat.opacity = 0.42 + pulse * 0.36;
      hilltopStandard.innerRing.rotation.z = time * 0.45;
    }

    if (siegeRam && siegeRam.ramAssembly) {
      siegeRam.ramAssembly.rotation.z = Math.sin(time * 1.8) * 0.025;
    }
  }

  return {
    propsGroup,
    colliders,
    siegeRam,
    hilltopStandard,
    braziers,
    banners,
    update,
  };
}
