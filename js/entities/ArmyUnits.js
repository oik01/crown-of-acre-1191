import * as THREE from '../vendor/three.module.js';
import { getMaterials } from '../graphics/ProceduralTextures.js';
import { registerWindCloth, mergeStaticMeshesByMaterial } from '../graphics/PostProcessing.js';
import { createCrusaderKnight } from './CrusaderKnight.js';
import { createWarhorse } from './Warhorse.js';

/**
 * Enables shadow casting and receiving on all meshes in a hierarchy.
 */
function enableShadows(obj, cast = true, receive = false) {
  obj.traverse((child) => {
    if (child.isMesh) {
      const isBasic = child.material && child.material.type === 'MeshBasicMaterial';
      child.castShadow = cast && !isBasic;
      child.receiveShadow = receive && !isBasic;
    }
  });
}

/**
 * Creates a curved cylindrical shell segment with UVs remapped [uMin..uMax] across the front arc
 * so Crusader crosses and Saracen medallions sit 100% centered on the chest.
 */
function createCurvedTabardShellGeometry(
  radiusTop,
  radiusBottom,
  height,
  thetaStart,
  thetaLength,
  uMin = 0.08,
  uMax = 0.92
) {
  const geom = new THREE.CylinderGeometry(
    radiusTop,
    radiusBottom,
    height,
    16,
    1,
    true,
    thetaStart,
    thetaLength
  );
  const uvs = geom.attributes.uv;
  for (let i = 0; i < uvs.count; i++) {
    const u = uvs.getX(i);
    const v = uvs.getY(i);
    uvs.setXY(i, uMin + u * (uMax - uMin), v);
  }
  uvs.needsUpdate = true;
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a Crusader Conical Nasal Helm or Wide-Brimmed Steel Kettle Hat
 * with exposed eyes, sculpted face, beard, and chainmail coif collar.
 */
function buildCrusaderInfantryHead(mats, useKettleHat = false) {
  const headGroup = new THREE.Group();
  headGroup.name = 'headGroup';

  // Chainmail coif covering neck and lower jaw
  const mailNeck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.102, 0.138, 0.16, 16),
    mats.chainmail
  );
  mailNeck.position.set(0, 0.045, -0.005);
  headGroup.add(mailNeck);

  const mailCollar = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.11, 16, 1, true),
    mats.chainmail
  );
  mailCollar.position.set(0, 0.01, 0);
  headGroup.add(mailCollar);

  // Sculpted head & face inside the open-faced helmet
  const faceSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.114, 14, 12),
    mats.skinFair
  );
  faceSphere.scale.set(0.94, 1.05, 1.02);
  faceSphere.position.set(0, 0.17, 0.016);
  headGroup.add(faceSphere);

  // Eyes & brows clearly visible at +Z front
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 8, 8),
      mats.visorSlit
    );
    eye.position.set(side * 0.04, 0.184, 0.12);
    headGroup.add(eye);

    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(0.034, 0.01, 0.016),
      mats.horseHairDark
    );
    brow.position.set(side * 0.04, 0.2, 0.122);
    brow.rotation.z = -side * 0.1;
    headGroup.add(brow);
  }

  // Sculpted medieval beard & mustache over chin
  const beard = new THREE.Mesh(
    new THREE.ConeGeometry(0.092, 0.13, 10),
    mats.horseHairDark
  );
  beard.rotation.x = Math.PI;
  beard.scale.set(0.95, 1, 0.78);
  beard.position.set(0, 0.105, 0.068);
  headGroup.add(beard);

  if (useKettleHat) {
    // Wide-Brimmed Steel Kettle Hat (Chapel-de-Fer)
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.128, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      mats.steelPlate
    );
    dome.position.set(0, 0.215, 0.008);
    headGroup.add(dome);

    const brim = new THREE.Mesh(
      new THREE.ConeGeometry(0.228, 0.052, 20, 1, true),
      mats.steelPlate
    );
    brim.position.set(0, 0.222, 0.008);
    headGroup.add(brim);

    const brimBand = new THREE.Mesh(
      new THREE.TorusGeometry(0.128, 0.008, 6, 20),
      mats.gildedBrass
    );
    brimBand.rotation.x = Math.PI * 0.5;
    brimBand.position.set(0, 0.23, 0.008);
    headGroup.add(brimBand);
  } else {
    // 12th-Century Conical Spangenhelm with Prominent Vertical Steel Nasal Bar
    const conicalBowl = new THREE.Mesh(
      new THREE.ConeGeometry(0.132, 0.21, 18),
      mats.steelPlate
    );
    conicalBowl.scale.set(0.95, 1, 1.06);
    conicalBowl.position.set(0, 0.3, 0.008);
    headGroup.add(conicalBowl);

    const browBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.133, 0.133, 0.028, 18),
      mats.gildedBrass
    );
    browBand.scale.set(0.95, 1, 1.06);
    browBand.position.set(0, 0.21, 0.008);
    headGroup.add(browBand);

    const nasalBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.095, 0.018),
      mats.steelPlate
    );
    nasalBar.position.set(0, 0.174, 0.142);
    headGroup.add(nasalBar);
  }

  mergeStaticMeshesByMaterial(headGroup, { castShadow: true, receiveShadow: true });
  headGroup.userData.noMerge = true;

  return headGroup;
}

/**
 * Builds the Saracen / Seljuk Fluted Spangenhelm wrapped in a voluminous pleated cloth
 * Turban/Keffiyeh with exposed face, fierce eyes, dark beard, chainmail aventail,
 * gilded nasal guard, front jewel brooch, and optional Royal Commander plumes.
 */
function buildSaracenHead(mats, { isCommander = false, id = 0 }) {
  const headGroup = new THREE.Group();
  headGroup.name = 'headGroup';

  // Chainmail aventail covering neck and shoulders (kept below y = 0.12 so face is 100% exposed!)
  const aventail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.142, 0.12, 16),
    mats.chainmail
  );
  aventail.position.set(0, 0.04, -0.005);
  headGroup.add(aventail);

  // Sculpted Olive-Skinned Face clearly exposed beneath the turban
  const headCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.114, 14, 12),
    mats.skinOlive
  );
  headCore.scale.set(0.94, 1.05, 1.04);
  headGroup.add(headCore);
  headCore.position.set(0, 0.168, 0.018);

  // Fierce Dark Eyes & Angled Eyebrows
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 8, 8),
      mats.visorSlit
    );
    eye.position.set(side * 0.038, 0.18, 0.124);
    headGroup.add(eye);

    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(0.036, 0.01, 0.016),
      mats.horseHairDark
    );
    brow.position.set(side * 0.038, 0.196, 0.126);
    brow.rotation.z = side * 0.14;
    headGroup.add(brow);
  }

  // Sculpted Dark Saracen Beard & Mustache framing the jaw
  const beard = new THREE.Mesh(
    new THREE.ConeGeometry(0.092, 0.13, 10),
    mats.horseHairDark
  );
  beard.rotation.x = Math.PI;
  beard.scale.set(0.92, 1, 0.78);
  beard.position.set(0, 0.102, 0.068);
  headGroup.add(beard);

  const turbanMat = isCommander
    ? mats.saracenRoyalTunic
    : id % 2 === 0
    ? mats.turbanWhite
    : mats.turbanSaffron;

  // Fluted Conical Steel/Gilded Spangenhelm Crown rising above the turban
  const flutedHelm = new THREE.Mesh(
    new THREE.ConeGeometry(0.122, 0.22, 16),
    isCommander ? mats.gildedBrass : mats.steelPlate
  );
  flutedHelm.position.set(0, 0.315, 0.005);
  headGroup.add(flutedHelm);

  const spike = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.016, 0.09, 8),
    mats.gildedBrass
  );
  spike.position.set(0, 0.45, 0.005);
  headGroup.add(spike);

  // Voluminous Multi-Fold Pleated Cloth Turban wrapped around the Spangenhelm
  const mainTurban = new THREE.Mesh(
    new THREE.TorusGeometry(0.114, 0.052, 12, 20),
    turbanMat
  );
  mainTurban.rotation.x = Math.PI * 0.5;
  mainTurban.scale.set(1.04, 1.08, 0.92);
  mainTurban.position.set(0, 0.242, 0.008);
  headGroup.add(mainTurban);

  const upperFold = new THREE.Mesh(
    new THREE.TorusGeometry(0.108, 0.038, 10, 18),
    isCommander ? mats.turbanSaffron : turbanMat
  );
  upperFold.rotation.x = Math.PI * 0.46;
  upperFold.rotation.y = 0.28;
  upperFold.position.set(0, 0.272, 0.008);
  headGroup.add(upperFold);

  const crossFold = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.034, 10, 18),
    turbanMat
  );
  crossFold.rotation.x = Math.PI * 0.54;
  crossFold.rotation.y = -0.28;
  crossFold.position.set(0, 0.256, 0.01);
  headGroup.add(crossFold);

  // Golden Brooch & Crimson Gem Medallion pinned to the front center of the Turban
  const brooch = new THREE.Mesh(
    new THREE.SphereGeometry(0.024, 8, 8),
    mats.gildedBrass
  );
  brooch.scale.set(1.1, 1.3, 0.6);
  brooch.position.set(0, 0.252, 0.168);
  headGroup.add(brooch);

  // Ornate Gilded Nasal Bar descending between the eyes
  const nasalBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.016, 0.075, 0.016),
    mats.gildedBrass
  );
  nasalBar.position.set(0, 0.182, 0.142);
  headGroup.add(nasalBar);

  // If Commander: Twin-plumed Golden Crown & Ostrich Feathers
  if (isCommander) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const crownPoint = new THREE.Mesh(
        new THREE.ConeGeometry(0.016, 0.055, 4),
        mats.gildedBrass
      );
      crownPoint.position.set(Math.sin(a) * 0.145, 0.285, Math.cos(a) * 0.145);
      crownPoint.rotation.y = a;
      headGroup.add(crownPoint);
    }

    for (const side of [-1, 1]) {
      const plume = new THREE.Mesh(
        new THREE.ConeGeometry(0.032, 0.26, 8),
        mats.turbanWhite
      );
      plume.scale.set(0.5, 1, 1.3);
      plume.position.set(side * 0.065, 0.425, -0.05);
      plume.rotation.x = -0.48;
      plume.rotation.z = -side * 0.28;
      headGroup.add(plume);
    }
  }

  mergeStaticMeshesByMaterial(headGroup, { castShadow: true, receiveShadow: true });
  headGroup.userData.noMerge = true;

  return headGroup;
}

/**
 * Builds an elongated Curved Teardrop Norman/Crusader Kite Shield with outward-facing +Z normal.
 */
function buildKiteShield(mats) {
  const shieldGroup = new THREE.Group();
  shieldGroup.name = 'shieldMesh';

  const width = 0.48;
  const height = 0.88;
  const geom = new THREE.PlaneGeometry(width, height, 10, 16);
  const pos = geom.attributes.position;
  const uvs = geom.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const u = uvs.getX(i);
    const v = uvs.getY(i);
    const nx = (u - 0.5) * 2;

    let wScale = 1.0;
    if (v < 0.72) {
      wScale = Math.pow(v / 0.72, 0.82);
    } else {
      const t = (v - 0.72) / 0.28;
      wScale = Math.sqrt(Math.max(0.05, 1 - t * t * 0.85));
    }

    const x = nx * (width * 0.5) * wScale;
    const y = (v - 0.5) * height;
    const z = (1 - nx * nx * wScale) * 0.085;
    pos.setXYZ(i, x, y, z);
  }
  geom.computeVertexNormals();

  const front = new THREE.Mesh(geom, mats.crusaderShield);
  shieldGroup.add(front);

  const backGeom = geom.clone();
  const bPos = backGeom.attributes.position;
  for (let i = 0; i < bPos.count; i++) {
    bPos.setZ(i, -bPos.getZ(i));
  }
  backGeom.computeVertexNormals();
  const back = new THREE.Mesh(backGeom, mats.leatherDark);
  back.rotation.y = Math.PI;
  back.position.z = -0.006;
  shieldGroup.add(back);

  const boss = new THREE.Mesh(
    new THREE.SphereGeometry(0.058, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
    mats.steelPlate
  );
  boss.rotation.x = Math.PI * 0.5;
  boss.position.set(0, 0.14, 0.082);
  shieldGroup.add(boss);

  mergeStaticMeshesByMaterial(shieldGroup, { castShadow: true, receiveShadow: true });
  shieldGroup.userData.noMerge = true;

  return shieldGroup;
}

/**
 * Builds the Saracen Convex Round Targe Shield with protruding gilded-brass starburst boss (+Z front).
 */
function buildSaracenRoundShield(mats) {
  const shieldGroup = new THREE.Group();
  shieldGroup.name = 'shieldMesh';

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.31, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.28),
    mats.saracenShield
  );
  dome.rotation.x = Math.PI * 0.5;
  dome.position.z = -0.18;
  shieldGroup.add(dome);

  const backing = new THREE.Mesh(
    new THREE.CircleGeometry(0.23, 20),
    mats.leatherDark
  );
  backing.rotation.y = Math.PI;
  backing.position.z = 0.005;
  shieldGroup.add(backing);

  const boss = new THREE.Mesh(
    new THREE.SphereGeometry(0.068, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
    mats.gildedBrass
  );
  boss.rotation.x = Math.PI * 0.5;
  boss.position.z = 0.095;
  shieldGroup.add(boss);

  const bossSpike = new THREE.Mesh(
    new THREE.ConeGeometry(0.018, 0.065, 8),
    mats.gildedBrass
  );
  bossSpike.rotation.x = Math.PI * 0.5;
  bossSpike.position.z = 0.175;
  shieldGroup.add(bossSpike);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.012, 8, 24),
    mats.gildedBrass
  );
  rim.position.z = 0.025;
  shieldGroup.add(rim);

  mergeStaticMeshesByMaterial(shieldGroup, { castShadow: true, receiveShadow: true });
  shieldGroup.userData.noMerge = true;

  return shieldGroup;
}

/**
 * Builds a Curved Saracen Scimitar (Kilij / Shamshir) with flared yelman tip and S-curved brass guard.
 */
function buildScimitar(mats, isCommander = false) {
  const scimitar = new THREE.Group();
  scimitar.name = 'swordMesh';

  const scale = isCommander ? 1.15 : 1.0;

  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.018, 0.14, 10),
    mats.leatherDark
  );
  scimitar.add(grip);

  const hookedPommel = new THREE.Mesh(
    new THREE.SphereGeometry(0.026, 10, 8),
    mats.gildedBrass
  );
  hookedPommel.position.set(0, -0.08, 0.014);
  scimitar.add(hookedPommel);

  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.022, 0.028),
    mats.gildedBrass
  );
  guard.position.y = 0.075;
  scimitar.add(guard);

  const segments = 6;
  const segLen = 0.135 * scale;
  for (let s = 0; s < segments; s++) {
    const frac = s / (segments - 1);
    const curveAngle = frac * frac * 0.52;
    const width = s === segments - 1 ? 0.024 : s === segments - 2 ? 0.052 : 0.038 + frac * 0.01;

    const bladeSeg = new THREE.Mesh(
      s === segments - 1
        ? new THREE.ConeGeometry(0.028, segLen * 1.2, 4)
        : new THREE.BoxGeometry(0.009, segLen * 1.08, width),
      mats.polishedBlade
    );

    if (s === segments - 1) {
      bladeSeg.scale.set(0.3, 1, 1.2);
    }

    const py = 0.14 + s * segLen * 0.94;
    const pz = -Math.pow(frac, 1.8) * 0.14;
    bladeSeg.position.set(0, py, pz);
    bladeSeg.rotation.x = -curveAngle;
    scimitar.add(bladeSeg);
  }

  mergeStaticMeshesByMaterial(scimitar, { castShadow: true, receiveShadow: true });
  scimitar.userData.noMerge = true;

  return scimitar;
}

/**
 * Builds a Long Ashwood Infantry Spear (2.25m) or Flanged Iron Mace.
 */
function buildInfantryPolearm(mats, useMace = false) {
  const weapon = new THREE.Group();
  weapon.name = 'weaponMesh';

  if (useMace) {
    const haft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.021, 0.72, 10),
      mats.woodOak
    );
    haft.position.y = 0.24;
    weapon.add(haft);

    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.022, 0.18, 10),
      mats.leatherDark
    );
    grip.position.y = -0.02;
    weapon.add(grip);

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.022, 0.06, 10),
      mats.gildedBrass
    );
    collar.position.y = 0.56;
    weapon.add(collar);

    for (let f = 0; f < 6; f++) {
      const angle = (f / 6) * Math.PI * 2;
      const flange = new THREE.Mesh(
        new THREE.ConeGeometry(0.055, 0.16, 3),
        mats.steelPlate
      );
      flange.scale.set(0.25, 1, 1.0);
      flange.position.set(Math.sin(angle) * 0.032, 0.66, Math.cos(angle) * 0.032);
      flange.rotation.y = angle;
      weapon.add(flange);
    }

    const topSpike = new THREE.Mesh(
      new THREE.ConeGeometry(0.022, 0.07, 8),
      mats.steelPlate
    );
    topSpike.position.y = 0.77;
    weapon.add(topSpike);
  } else {
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.019, 0.022, 2.05, 10),
      mats.woodOak
    );
    shaft.position.y = 0.35;
    weapon.add(shaft);

    const socket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.022, 0.12, 10),
      mats.steelPlate
    );
    socket.position.y = 1.42;
    weapon.add(socket);

    const lugs = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.018, 0.018),
      mats.steelPlate
    );
    lugs.position.y = 1.44;
    weapon.add(lugs);

    const spearhead = new THREE.Mesh(
      new THREE.ConeGeometry(0.034, 0.32, 4),
      mats.polishedBlade
    );
    spearhead.scale.set(0.38, 1, 1.05);
    spearhead.position.y = 1.62;
    weapon.add(spearhead);

    const buttSpike = new THREE.Mesh(
      new THREE.ConeGeometry(0.022, 0.1, 8),
      mats.darkIron
    );
    buttSpike.rotation.z = Math.PI;
    buttSpike.position.y = -0.72;
    weapon.add(buttSpike);
  }

  mergeStaticMeshesByMaterial(weapon, { castShadow: true, receiveShadow: true });
  weapon.userData.noMerge = true;

  return weapon;
}

/**
 * Builds a Detailed Medieval Arbalest Crossbow with Oak Tiller, Tempered Steel Prod,
 * Iron Foot-Stirrup, Taut Bowstring, and Seated Quarrel Bolt.
 */
function buildCrossbow(mats) {
  const crossbow = new THREE.Group();
  crossbow.name = 'bowMesh';

  const tiller = new THREE.Mesh(
    new THREE.BoxGeometry(0.048, 0.068, 0.68),
    mats.woodOak
  );
  tiller.position.set(0, 0, 0.22);
  crossbow.add(tiller);

  const groove = new THREE.Mesh(
    new THREE.BoxGeometry(0.016, 0.01, 0.56),
    mats.gildedBrass
  );
  groove.position.set(0, 0.036, 0.26);
  crossbow.add(groove);

  const prod = new THREE.Mesh(
    new THREE.TorusGeometry(0.36, 0.018, 8, 20, Math.PI * 0.85),
    mats.steelPlate
  );
  prod.rotation.x = Math.PI * 0.5;
  prod.rotation.z = -Math.PI * 0.425;
  prod.position.set(0, 0.01, 0.21);
  crossbow.add(prod);

  const stirrup = new THREE.Mesh(
    new THREE.TorusGeometry(0.065, 0.008, 6, 12, Math.PI * 1.3),
    mats.darkIron
  );
  stirrup.rotation.x = Math.PI * 0.5;
  stirrup.rotation.z = -Math.PI * 0.15;
  stirrup.position.set(0, 0, 0.58);
  crossbow.add(stirrup);

  for (const side of [-1, 1]) {
    const stringHalf = new THREE.Mesh(
      new THREE.CylinderGeometry(0.003, 0.003, 0.38, 6),
      mats.turbanWhite
    );
    stringHalf.rotation.x = Math.PI * 0.5;
    stringHalf.rotation.z = side * 0.82;
    stringHalf.position.set(side * 0.14, 0.025, 0.34);
    crossbow.add(stringHalf);
  }

  const boltShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.38, 6),
    mats.woodOak
  );
  boltShaft.rotation.x = Math.PI * 0.5;
  boltShaft.position.set(0, 0.044, 0.42);
  crossbow.add(boltShaft);

  const boltHead = new THREE.Mesh(
    new THREE.ConeGeometry(0.012, 0.055, 4),
    mats.polishedBlade
  );
  boltHead.rotation.x = Math.PI * 0.5;
  boltHead.position.set(0, 0.044, 0.63);
  crossbow.add(boltHead);

  mergeStaticMeshesByMaterial(crossbow, { castShadow: true, receiveShadow: true });
  crossbow.userData.noMerge = true;

  return crossbow;
}

/**
 * Builds a Sculpted Saracen Recurve Composite Bow with Curved Horn Siyah Tips,
 * Drawn Bowstring, and a Nocked Feathered Arrow passing straight through the bow grip.
 */
function buildCompositeRecurveBow(mats) {
  const bowGroup = new THREE.Group();
  bowGroup.name = 'bowMesh';

  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.016, 0.18, 8),
    mats.gildedBrass
  );
  bowGroup.add(grip);

  for (const dir of [-1, 1]) {
    const innerLimb = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.015, 0.34, 8),
      mats.leatherSaddle
    );
    innerLimb.position.set(0, dir * 0.22, 0.05);
    innerLimb.rotation.x = dir * 0.38;
    bowGroup.add(innerLimb);

    const siyahTip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.012, 0.22, 8),
      mats.gildedBrass
    );
    siyahTip.position.set(0, dir * 0.44, 0.04);
    siyahTip.rotation.x = -dir * 0.35;
    bowGroup.add(siyahTip);

    // Drawn two-part bowstring meeting at the nocked arrow (-Z = -0.32)
    const stringSeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0025, 0.0025, 0.58, 6),
      mats.turbanWhite
    );
    stringSeg.position.set(0, dir * 0.25, -0.14);
    stringSeg.rotation.x = dir * 0.58;
    bowGroup.add(stringSeg);
  }

  // Nocked Arrow aligned directly along the bow's firing axis (+Z) from string to tip
  const arrowShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0045, 0.0045, 0.68, 6),
    mats.woodOak
  );
  arrowShaft.rotation.x = Math.PI * 0.5;
  arrowShaft.position.set(0.016, 0, 0.02);
  bowGroup.add(arrowShaft);

  const arrowHead = new THREE.Mesh(
    new THREE.ConeGeometry(0.012, 0.055, 4),
    mats.polishedBlade
  );
  arrowHead.rotation.x = Math.PI * 0.5;
  arrowHead.position.set(0.016, 0, 0.38);
  bowGroup.add(arrowHead);

  const arrowFletch = new THREE.Mesh(
    new THREE.BoxGeometry(0.024, 0.005, 0.075),
    mats.turbanWhite
  );
  arrowFletch.position.set(0.016, 0, -0.28);
  bowGroup.add(arrowFletch);

  mergeStaticMeshesByMaterial(bowGroup, { castShadow: true, receiveShadow: true });
  bowGroup.userData.noMerge = true;

  return bowGroup;
}

/**
 * Builds a Leather Quiver packed with 5 feathered arrows/bolts.
 */
function buildQuiver(mats) {
  const quiver = new THREE.Group();
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.042, 0.42, 12),
    mats.leatherDark
  );
  quiver.add(tube);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.055, 0.006, 6, 12),
    mats.gildedBrass
  );
  rim.rotation.x = Math.PI * 0.5;
  rim.position.y = 0.21;
  quiver.add(rim);

  const offsets = [
    [0, 0],
    [0.022, 0.015],
    [-0.022, 0.015],
    [0.018, -0.02],
    [-0.018, -0.02],
  ];
  for (const [ox, oz] of offsets) {
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.22, 6),
      mats.woodOak
    );
    shaft.position.set(ox, 0.26, oz);
    quiver.add(shaft);

    const fletch = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.065, 0.004),
      mats.turbanWhite
    );
    fletch.position.set(ox, 0.33, oz);
    quiver.add(fletch);
  }

  return quiver;
}

/**
 * Builds an articulated humanoid rig for Crusader Infantry/Crossbowmen and Saracen Cavalry/Spearmen/Archers.
 */
function buildCustomUnitRig(mats, { faction, role, id }) {
  const isSaracen = faction === 'saracen';
  const isCommander = role === 'commander';
  const isArcher = role === 'archer';
  const isCavalry = role === 'cavalry' || role === 'commander';

  const root = new THREE.Group();
  root.name = `${faction}_${role}_${id}`;

  const pelvisGroup = new THREE.Group();
  pelvisGroup.name = 'pelvisGroup';
  pelvisGroup.position.set(0, 0.92, 0);
  root.add(pelvisGroup);

  const torsoBaseMat = isSaracen
    ? isCavalry
      ? mats.saracenLamellar
      : mats.saracenGambeson
    : role === 'infantry'
    ? mats.chainmail
    : mats.infantryGambeson;

  const tunicMat = isSaracen
    ? id % 2 === 0 || isCommander
      ? mats.saracenRoyalTunic
      : mats.saracenTurquoiseTunic
    : mats.crusaderSurcoat;

  // Pelvis & Contoured Tunic Skirt (extended down to y = -0.18 to eliminate hip gaps!)
  const pelvisMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.165, 0.182, 0.2, 14),
    torsoBaseMat
  );
  pelvisMesh.scale.set(1.06, 1, 0.84);
  pelvisGroup.add(pelvisMesh);

  const frontSkirtGeo = createCurvedTabardShellGeometry(
    0.178,
    0.236,
    0.34,
    -Math.PI * 0.48,
    Math.PI * 0.96,
    0.06,
    0.94
  );
  const frontSkirt = new THREE.Mesh(frontSkirtGeo, tunicMat);
  frontSkirt.scale.set(1.06, 1, 0.85);
  frontSkirt.position.y = -0.165;
  pelvisGroup.add(frontSkirt);

  const rearSkirtGeo = createCurvedTabardShellGeometry(
    0.178,
    0.236,
    0.34,
    Math.PI * 0.52,
    Math.PI * 0.96,
    0.06,
    0.94
  );
  const rearSkirt = new THREE.Mesh(rearSkirtGeo, tunicMat);
  rearSkirt.scale.set(1.06, 1, 0.85);
  rearSkirt.position.y = -0.165;
  pelvisGroup.add(rearSkirt);

  // Torso Group
  const torsoGroup = new THREE.Group();
  torsoGroup.name = 'torsoGroup';
  torsoGroup.position.set(0, 0.06, 0);
  pelvisGroup.add(torsoGroup);

  const chestMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.208, 0.168, 0.45, 16),
    torsoBaseMat
  );
  chestMesh.scale.set(1.06, 1, 0.78);
  chestMesh.position.y = 0.225;
  torsoGroup.add(chestMesh);

  // Curved Front Chest Tabard / Medallion Shell (100% centered on +Z chest!)
  const frontChestShellGeo = createCurvedTabardShellGeometry(
    0.22,
    0.18,
    0.43,
    -Math.PI * 0.35,
    Math.PI * 0.7,
    0.08,
    0.92
  );
  const frontChestShell = new THREE.Mesh(
    frontChestShellGeo,
    isSaracen && isCavalry && !isCommander ? mats.saracenLamellar : tunicMat
  );
  frontChestShell.scale.set(1.07, 1, 0.82);
  frontChestShell.position.set(0, 0.22, 0.004);
  torsoGroup.add(frontChestShell);

  const rearChestShellGeo = createCurvedTabardShellGeometry(
    0.22,
    0.18,
    0.43,
    Math.PI * 0.65,
    Math.PI * 0.7,
    0.08,
    0.92
  );
  const rearChestShell = new THREE.Mesh(
    rearChestShellGeo,
    isSaracen && isCavalry && !isCommander ? mats.saracenLamellar : tunicMat
  );
  rearChestShell.scale.set(1.07, 1, 0.82);
  rearChestShell.position.set(0, 0.22, -0.004);
  torsoGroup.add(rearChestShell);

  if (isSaracen) {
    const mirrorDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.068, 0.016, 16),
      mats.gildedBrass
    );
    mirrorDisc.rotation.x = Math.PI * 0.5;
    mirrorDisc.position.set(0, 0.25, 0.172);
    torsoGroup.add(mirrorDisc);
  }

  // Waist Sash / Belt & Buckle
  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.184, 0.188, 0.052, 16),
    isSaracen ? mats.gildedBrass : mats.leatherDark
  );
  belt.scale.set(1.08, 1, 0.84);
  belt.position.y = 0.02;
  torsoGroup.add(belt);

  let capeEntry = null;
  if (isCommander) {
    const capeGeo = new THREE.PlaneGeometry(0.66, 1.02, 8, 12);
    capeGeo.translate(0, -0.51, 0);
    const capeMesh = new THREE.Mesh(capeGeo, mats.capeCompanionGold);
    capeMesh.position.set(0, 0.43, -0.19);
    capeMesh.rotation.x = 0.16;
    torsoGroup.add(capeMesh);
    capeEntry = registerWindCloth(capeMesh, 'top', 0.085, 4.5);
  }

  if (isArcher) {
    const quiver = buildQuiver(mats);
    if (isSaracen) {
      quiver.position.set(0.21, -0.06, -0.04);
      quiver.rotation.x = 0.42;
      quiver.rotation.z = -0.22;
    } else {
      quiver.position.set(0.06, 0.24, -0.19);
      quiver.rotation.z = -0.35;
      quiver.rotation.x = -0.12;
    }
    torsoGroup.add(quiver);
  }

  // Head Group
  const headGroup = isSaracen
    ? buildSaracenHead(mats, { isCommander, id })
    : buildCrusaderInfantryHead(mats, isArcher || id % 2 === 1);
  headGroup.position.set(0, 0.45, 0);
  torsoGroup.add(headGroup);

  const sleeveMat = isSaracen
    ? isCavalry
      ? mats.saracenRoyalTunic
      : mats.saracenGambeson
    : isArcher
    ? mats.infantryGambeson
    : mats.chainmail;

  function buildArm(side) {
    const armGroup = new THREE.Group();
    armGroup.name = side > 0 ? 'leftArmGroup' : 'rightArmGroup';
    armGroup.position.set(side * 0.25, 0.4, 0);

    const shoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 12, 10),
      isSaracen && isCavalry ? mats.saracenLamellar : sleeveMat
    );
    shoulder.scale.set(1.12, 0.92, 1.06);
    armGroup.add(shoulder);

    const upperArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.064, 0.054, 0.26, 10),
      sleeveMat
    );
    upperArm.position.y = -0.13;
    armGroup.add(upperArm);

    const forearmGroup = new THREE.Group();
    forearmGroup.name = side > 0 ? 'leftForearmGroup' : 'rightForearmGroup';
    forearmGroup.position.set(0, -0.26, 0);
    armGroup.add(forearmGroup);

    const vambrace = new THREE.Mesh(
      new THREE.CylinderGeometry(0.054, 0.044, 0.24, 10),
      isCavalry ? (isSaracen ? mats.gildedBrass : mats.steelPlate) : mats.leatherDark
    );
    vambrace.position.y = -0.12;
    forearmGroup.add(vambrace);

    const handGroup = new THREE.Group();
    handGroup.name = side > 0 ? 'leftHandGroup' : 'rightHandGroup';
    handGroup.position.set(0, -0.24, 0);
    forearmGroup.add(handGroup);

    const handMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.058, 0.075, 0.065),
      isSaracen ? mats.skinOlive : mats.leatherDark
    );
    handMesh.position.y = -0.02;
    handGroup.add(handMesh);

    return { armGroup, forearmGroup, handGroup };
  }

  const { armGroup: leftArmGroup, forearmGroup: leftForearmGroup, handGroup: leftHandGroup } = buildArm(1);
  const { armGroup: rightArmGroup, forearmGroup: rightForearmGroup, handGroup: rightHandGroup } = buildArm(-1);
  torsoGroup.add(leftArmGroup);
  torsoGroup.add(rightArmGroup);

  let shieldMesh = null;
  let weaponMesh = null;
  let bowMesh = null;

  if (isArcher) {
    if (isSaracen) {
      bowMesh = buildCompositeRecurveBow(mats);
      bowMesh.position.set(0, -0.04, 0.04);
      bowMesh.rotation.set(Math.PI * 0.5, 0, 0.12);
      leftHandGroup.add(bowMesh);
      weaponMesh = bowMesh;
    } else {
      bowMesh = buildCrossbow(mats);
      bowMesh.position.set(-0.08, -0.03, 0.05);
      rightHandGroup.add(bowMesh);
      weaponMesh = bowMesh;
    }
  } else {
    shieldMesh = isSaracen ? buildSaracenRoundShield(mats) : buildKiteShield(mats);
    shieldMesh.position.set(0.09, -0.12, 0.065);
    shieldMesh.rotation.order = 'YXZ';
    shieldMesh.rotation.set(0.88, 0.42, -0.18);
    leftForearmGroup.add(shieldMesh);

    if (isSaracen) {
      if (isCavalry) {
        weaponMesh = buildScimitar(mats, isCommander);
        weaponMesh.position.set(0, -0.02, 0.03);
        weaponMesh.rotation.x = Math.PI * 0.42;
      } else {
        weaponMesh = buildInfantryPolearm(mats, false);
        weaponMesh.position.set(0, -0.02, 0.03);
        weaponMesh.rotation.x = Math.PI * 0.38;
      }
    } else {
      const useMace = id % 3 === 2;
      weaponMesh = buildInfantryPolearm(mats, useMace);
      weaponMesh.position.set(0, -0.02, 0.03);
      weaponMesh.rotation.x = Math.PI * 0.38;
    }
    rightHandGroup.add(weaponMesh);
  }

  leftHandGroup.userData.noMerge = true;
  mergeStaticMeshesByMaterial(leftForearmGroup, { castShadow: true, receiveShadow: true });
  leftForearmGroup.userData.noMerge = true;

  mergeStaticMeshesByMaterial(leftArmGroup, { castShadow: true, receiveShadow: true });
  leftArmGroup.userData.noMerge = true;

  rightHandGroup.userData.noMerge = true;
  mergeStaticMeshesByMaterial(rightForearmGroup, { castShadow: true, receiveShadow: true });
  rightForearmGroup.userData.noMerge = true;

  mergeStaticMeshesByMaterial(rightArmGroup, { castShadow: true, receiveShadow: true });
  rightArmGroup.userData.noMerge = true;

  mergeStaticMeshesByMaterial(torsoGroup, { castShadow: true, receiveShadow: true });
  torsoGroup.userData.noMerge = true;

  function buildLeg(side) {
    const legGroup = new THREE.Group();
    legGroup.name = side > 0 ? 'leftLegGroup' : 'rightLegGroup';
    legGroup.position.set(side * 0.11, -0.02, 0);

    const trouserMat = isSaracen
      ? isCavalry
        ? mats.saracenGambeson
        : mats.turbanSaffron
      : mats.infantryGambeson;

    const hipSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 10, 8),
      trouserMat
    );
    hipSphere.position.y = -0.02;
    legGroup.add(hipSphere);

    const thigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.096, 0.074, 0.42, 12),
      trouserMat
    );
    thigh.position.y = -0.21;
    legGroup.add(thigh);

    const shinGroup = new THREE.Group();
    shinGroup.name = side > 0 ? 'leftShinGroup' : 'rightShinGroup';
    shinGroup.position.set(0, -0.43, 0);
    legGroup.add(shinGroup);

    const kneeCop = new THREE.Mesh(
      new THREE.SphereGeometry(0.072, 10, 8),
      isCavalry ? (isSaracen ? mats.gildedBrass : mats.steelPlate) : mats.leatherDark
    );
    kneeCop.position.z = 0.01;
    shinGroup.add(kneeCop);

    const shin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.066, 0.05, 0.39, 12),
      isCavalry ? mats.leatherSaddle : mats.leatherDark
    );
    shin.position.y = -0.2;
    shinGroup.add(shin);

    const boot = new THREE.Mesh(
      new THREE.BoxGeometry(0.088, 0.072, 0.21),
      mats.leatherDark
    );
    boot.position.set(0, -0.434, 0.035);
    shinGroup.add(boot);

    mergeStaticMeshesByMaterial(shinGroup, { castShadow: true, receiveShadow: true });
    shinGroup.userData.noMerge = true;

    mergeStaticMeshesByMaterial(legGroup, { castShadow: true, receiveShadow: true });
    legGroup.userData.noMerge = true;

    return { legGroup, shinGroup };
  }

  const { legGroup: leftLegGroup, shinGroup: leftShinGroup } = buildLeg(1);
  const { legGroup: rightLegGroup, shinGroup: rightShinGroup } = buildLeg(-1);
  pelvisGroup.add(leftLegGroup);
  pelvisGroup.add(rightLegGroup);

  mergeStaticMeshesByMaterial(pelvisGroup, { castShadow: true, receiveShadow: true });

  let currentlyMounted = Boolean(isCavalry);

  function setMountedPose(isMounted) {
    currentlyMounted = Boolean(isMounted);
    if (currentlyMounted) {
      pelvisGroup.position.set(0, 0, 0);
      leftLegGroup.rotation.set(-0.38, 0.12, 0.42);
      rightLegGroup.rotation.set(-0.38, -0.12, -0.42);
      leftShinGroup.rotation.set(0.55, 0, -0.12);
      rightShinGroup.rotation.set(0.55, 0, 0.12);
    } else {
      pelvisGroup.position.set(0, 0.92, 0);
      leftLegGroup.rotation.set(0, 0, 0.03);
      rightLegGroup.rotation.set(0, 0, -0.03);
      leftShinGroup.rotation.set(0.05, 0, 0);
      rightShinGroup.rotation.set(0.05, 0, 0);
    }
  }

  setMountedPose(currentlyMounted);

  let internalTime = (id * 1.37) % 10;

  function updateAnimation(dt = 0.016, animState = {}) {
    internalTime += dt;
    const t = animState.time !== undefined ? animState.time : internalTime;
    const speed = animState.speed || 0;
    const isMounted = animState.isMounted !== undefined ? animState.isMounted : currentlyMounted;
    const attackProgress = animState.attackProgress || 0;
    const aimProgress = animState.aimProgress !== undefined ? animState.aimProgress : 0.5;

    if (isMounted !== currentlyMounted) {
      setMountedPose(isMounted);
    }
    if (capeEntry) {
      capeEntry.extraSpeed = speed;
    }

    const breath = Math.sin(t * 2.5) * 0.025;

    if (isMounted) {
      const gallopFreq = 7.5 + speed * 0.45;
      const strideFactor = Math.min(1, speed / 8);
      const bob = Math.sin(t * gallopFreq) * 0.035 * strideFactor;
      pelvisGroup.position.y = bob;
      torsoGroup.rotation.x = 0.08 * strideFactor + breath;
      torsoGroup.rotation.y = Math.cos(t * gallopFreq * 0.5) * 0.04 * strideFactor;
    } else {
      const moveFactor = Math.min(1, speed / 4.2);
      const phase = t * (6.0 + speed * 0.65);

      if (moveFactor > 0.05) {
        const swing = Math.sin(phase) * 0.6 * moveFactor;
        pelvisGroup.position.y = 0.92 + Math.abs(Math.cos(phase)) * 0.04 * moveFactor;
        torsoGroup.rotation.x = 0.1 * moveFactor + breath;
        torsoGroup.rotation.y = -Math.sin(phase) * 0.1 * moveFactor;

        leftLegGroup.rotation.set(swing, 0, 0.03);
        rightLegGroup.rotation.set(-swing, 0, -0.03);
        leftShinGroup.rotation.set(Math.max(0.05, -Math.cos(phase) * 0.6 * moveFactor), 0, 0);
        rightShinGroup.rotation.set(Math.max(0.05, Math.cos(phase) * 0.6 * moveFactor), 0, 0);
      } else {
        pelvisGroup.position.y = 0.92 + breath * 0.25;
        torsoGroup.rotation.x = breath;
        torsoGroup.rotation.y = Math.sin(t * 1.1) * 0.04;
        leftLegGroup.rotation.set(-0.06, 0, 0.04);
        rightLegGroup.rotation.set(0.08, 0, -0.04);
        leftShinGroup.rotation.set(0.1, 0, 0);
        rightShinGroup.rotation.set(0.12, 0, 0);
      }
    }

    // Arm & Weapon Poses
    if (isArcher) {
      const drawPulse = attackProgress > 0 ? Math.sin(attackProgress * Math.PI) : Math.sin(t * 1.8) * 0.15 + aimProgress * 0.3;
      if (isSaracen) {
        // Composite Bowman holds vertical recurve bow forward with extended left arm and draws string to cheek with right arm
        leftArmGroup.rotation.set(-1.42, -0.18, 0.06);
        leftForearmGroup.rotation.set(-0.12, 0, 0);
        rightArmGroup.rotation.set(-1.35, 0.42, -0.28);
        rightForearmGroup.rotation.set(-1.15 - drawPulse * 0.25, 0, 0);
      } else {
        // Crossbowman shoulders arbalest with both hands
        leftArmGroup.rotation.set(-0.95, -0.35, 0.15);
        leftForearmGroup.rotation.set(-0.65, 0.35, 0);
        rightArmGroup.rotation.set(-0.82 - drawPulse * 0.12, 0.12, -0.1);
        rightForearmGroup.rotation.set(-0.55, 0, 0);
      }
    } else {
      leftArmGroup.rotation.set(-0.38, 0.2, 0.16);
      leftForearmGroup.rotation.set(-0.68, 0.26, 0);

      if (attackProgress > 0) {
        const s = Math.sin(attackProgress * Math.PI);
        if (isSaracen && isCavalry) {
          const arc = Math.cos(attackProgress * Math.PI);
          rightArmGroup.rotation.set(-0.85 - 0.3 * s, arc * 0.85, -0.35);
          rightForearmGroup.rotation.set(-0.45, 0, -0.3 * s);
        } else {
          rightArmGroup.rotation.set(-0.92 * s - 0.3, -0.1 * s, -0.15);
          rightForearmGroup.rotation.set(-0.6 + 0.45 * s, 0, 0);
        }
      } else {
        const swing = Math.sin(t * 5.5) * 0.15 * Math.min(1, speed / 4);
        rightArmGroup.rotation.set(-0.32 + swing, -0.12, -0.18);
        rightForearmGroup.rotation.set(-0.58 + breath * 1.5, 0, 0);
      }
    }
  }

  return {
    root,
    pelvisGroup,
    torsoGroup,
    headGroup,
    leftArmGroup,
    leftForearmGroup,
    rightArmGroup,
    rightForearmGroup,
    rightHandGroup,
    leftLegGroup,
    leftShinGroup,
    rightLegGroup,
    rightShinGroup,
    shieldMesh,
    weaponMesh,
    swordMesh: weaponMesh,
    bowMesh,
    setMountedPose,
    updateAnimation,
  };
}

/**
 * Factory creating any Allied Crusader or Opposing Saracen/Seljuk army unit.
 */
export function createArmyUnit(options = {}) {
  const {
    faction = 'crusader',
    role = 'infantry',
    id = 0,
  } = options;

  const mats = getMaterials();
  const root = new THREE.Group();
  root.name = `ArmyUnit_${faction}_${role}_${id}`;

  const shouldMountByDefault =
    role === 'cavalry' || role === 'companion' || role === 'commander';

  let rig = null;
  let horseRig = null;
  let isMounted = shouldMountByDefault;

  if (
    faction === 'crusader' &&
    (role === 'companion' || role === 'cavalry' || role === 'commander')
  ) {
    rig = createCrusaderKnight({
      isPlayer: false,
      isCompanion: role === 'companion' || role === 'commander',
      variant:
        role === 'companion' || role === 'commander'
          ? 'companion'
          : id % 3 === 2
          ? 'hospitaller'
          : 'crusader',
      mounted: shouldMountByDefault,
    });
  } else {
    rig = buildCustomUnitRig(mats, { faction, role, id });
  }

  if (shouldMountByDefault) {
    const coatChoices =
      faction === 'saracen'
        ? ['bay', 'black', 'chestnut']
        : ['dapple_grey', 'bay', 'chestnut', 'black'];
    const coat =
      role === 'companion'
        ? id % 2 === 0
          ? 'dapple_grey'
          : 'bay'
        : role === 'commander' && faction === 'saracen'
        ? 'black'
        : coatChoices[id % coatChoices.length];

    horseRig = createWarhorse({
      coat,
      faction:
        role === 'companion' || (role === 'commander' && faction === 'crusader')
          ? 'companion'
          : faction,
      barding: faction === 'crusader' || role === 'commander' || id % 2 === 0,
    });

    root.add(horseRig.root);
    horseRig.saddleMountPoint.add(rig.root);
    rig.setMountedPose(true);
  } else {
    root.add(rig.root);
    rig.setMountedPose(false);
  }

  enableShadows(root, true, true);

  function setMounted(mountedBool) {
    isMounted = Boolean(mountedBool);
    if (isMounted && horseRig) {
      horseRig.root.visible = true;
      horseRig.saddleMountPoint.add(rig.root);
      rig.setMountedPose(true);
    } else {
      if (horseRig) {
        horseRig.root.visible = false;
      }
      root.add(rig.root);
      rig.setMountedPose(false);
    }
  }

  function updateAnimation(dt = 0.016, state = {}) {
    if (isMounted && horseRig) {
      horseRig.updateAnimation(dt, state);
    }
    rig.updateAnimation(dt, {
      ...state,
      isMounted,
    });
  }

  return {
    root,
    rig,
    horseRig,
    role,
    faction,
    isMounted,
    setMounted,
    updateAnimation,
  };
}
