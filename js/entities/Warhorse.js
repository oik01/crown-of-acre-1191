import * as THREE from '../vendor/three.module.js';
import { getMaterials } from '../graphics/ProceduralTextures.js';
import { mergeStaticMeshesByMaterial } from '../graphics/PostProcessing.js';

/**
 * Enables shadow casting and receiving on all meshes in a hierarchy.
 */
function enableShadows(obj, cast = true, receive = true) {
  obj.traverse((child) => {
    if (child.isMesh) {
      const isBasic = child.material && child.material.type === 'MeshBasicMaterial';
      child.castShadow = cast && !isBasic;
      child.receiveShadow = receive && !isBasic;
    }
  });
}

/**
 * Builds a smooth, contoured 3D Caparison Flank Drapery Panel that wraps organically
 * around the warhorse's shoulder, barrel ribcage, and hindquarters with natural vertical
 * drapery folds and a scalloped bottom hem (zero stiff box corners or spiky cones!).
 */
function createContouredFlankCaparison(mats, caparisonMat, side) {
  const flankGroup = new THREE.Group();
  flankGroup.position.set(0, 0.06, -0.02);

  const segsU = 28;
  const segsV = 12;
  const geom = new THREE.PlaneGeometry(1.42, 0.58, segsU, segsV);
  const pos = geom.attributes.position;
  const uvs = geom.attributes.uv;

  const hemPoints = [];

  for (let i = 0; i < pos.count; i++) {
    const u = uvs.getX(i); // 0..1 along horse length
    const v = uvs.getY(i); // 0 (bottom hem) .. 1 (top back/flank seam)

    // Map u along z from -0.72 (rear croup) to +0.70 (front chest)
    // Ensure right and left flanks both read front-to-back properly
    const zNorm = (u - 0.5) * 2; // -1..1
    const z = zNorm * 0.71;

    // Smooth elliptical contour wrapping around chest (+z) and hindquarters (-z)
    const bodyContour = Math.cos(zNorm * 1.02); // 1.0 at mid-barrel, ~0.52 at ends
    const topRadius = 0.22 + 0.145 * bodyContour;

    const drop = 1.0 - v; // 0 at top, 1 at bottom hem
    // Natural cloth drapery pleats along the flank
    const pleat = Math.sin(u * Math.PI * 8) * 0.012 * drop;
    // Soft scalloped wave along the bottom hem (8 rounded scallops, never spiky cones)
    const scallopHem = Math.abs(Math.sin(u * Math.PI * 8)) * 0.028 * Math.pow(drop, 2);

    const x = side * (topRadius + drop * 0.075 * (0.7 + 0.3 * bodyContour) + pleat);
    // Curve slightly inward at the extreme front chest and rear croup
    const yTopCurve = -Math.pow(zNorm, 2) * 0.055;
    const y = yTopCurve - drop * 0.54 + scallopHem;

    pos.setXYZ(i, x, y, z);

    // Remap UVs so the heraldic cross / medallion is centered on the flank
    uvs.setXY(i, 0.06 + u * 0.88, 0.06 + v * 0.88);
  }

  geom.computeVertexNormals();

  const clothMesh = new THREE.Mesh(geom, caparisonMat);
  flankGroup.add(clothMesh);

  // Contoured Golden Hem Border Tube following the exact lower contour of the caparison
  for (let s = 0; s <= segsU; s++) {
    const u = s / segsU;
    const zNorm = (u - 0.5) * 2;
    const z = zNorm * 0.71;
    const bodyContour = Math.cos(zNorm * 1.02);
    const topRadius = 0.22 + 0.145 * bodyContour;
    const pleat = Math.sin(u * Math.PI * 8) * 0.012;
    const scallopHem = Math.abs(Math.sin(u * Math.PI * 8)) * 0.028;
    const x = side * (topRadius + 0.075 * (0.7 + 0.3 * bodyContour) + pleat + 0.004);
    const y = -Math.pow(zNorm, 2) * 0.055 - 0.515 + scallopHem;
    hemPoints.push(new THREE.Vector3(x, y, z));
  }

  const hemCurve = new THREE.CatmullRomCurve3(hemPoints, false);
  const goldHemTube = new THREE.Mesh(
    new THREE.TubeGeometry(hemCurve, 28, 0.011, 6, false),
    mats.gildedBrass
  );
  flankGroup.add(goldHemTube);

  mergeStaticMeshesByMaterial(flankGroup, { castShadow: true, receiveShadow: true });
  flankGroup.userData.noMerge = true;

  return flankGroup;
}

/**
 * Builds the riveted steel & gilded-brass Chanfron (armored warhorse faceplate)
 * covering the forehead, cheekbones, and nasal bridge with central spike/boss.
 */
function buildChanfron(mats, faction) {
  const chanfron = new THREE.Group();
  chanfron.name = 'chanfron';

  const primaryMetal = faction === 'saracen' ? mats.gildedBrass : mats.steelPlate;
  const trimMetal = mats.gildedBrass;

  const foreheadPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.088, 0.105, 0.24, 12, 1, false, -Math.PI * 0.42, Math.PI * 0.84),
    primaryMetal
  );
  foreheadPlate.rotation.x = Math.PI * 0.48;
  foreheadPlate.scale.set(1.05, 1, 0.65);
  foreheadPlate.position.set(0, 0.068, 0.14);
  chanfron.add(foreheadPlate);

  const nasalPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.062, 0.086, 0.24, 12, 1, false, -Math.PI * 0.38, Math.PI * 0.76),
    primaryMetal
  );
  nasalPlate.rotation.x = Math.PI * 0.51;
  nasalPlate.scale.set(0.95, 1, 0.6);
  nasalPlate.position.set(0, 0.048, 0.33);
  chanfron.add(nasalPlate);

  const medialCrest = new THREE.Mesh(
    new THREE.BoxGeometry(0.016, 0.022, 0.42),
    trimMetal
  );
  medialCrest.position.set(0, 0.105, 0.23);
  medialCrest.rotation.x = 0.08;
  chanfron.add(medialCrest);

  const foreheadBoss = new THREE.Mesh(
    new THREE.ConeGeometry(0.036, 0.055, 8),
    trimMetal
  );
  foreheadBoss.rotation.x = Math.PI * 0.42;
  foreheadBoss.position.set(0, 0.125, 0.14);
  chanfron.add(foreheadBoss);

  for (const side of [-1, 1]) {
    const eyeGuard = new THREE.Mesh(
      new THREE.TorusGeometry(0.042, 0.008, 6, 12, Math.PI * 1.1),
      trimMetal
    );
    eyeGuard.position.set(side * 0.095, 0.055, 0.14);
    eyeGuard.rotation.y = side * Math.PI * 0.42;
    chanfron.add(eyeGuard);

    for (let r = 0; r < 4; r++) {
      const rivet = new THREE.Mesh(
        new THREE.SphereGeometry(0.0055, 6, 6),
        trimMetal
      );
      rivet.position.set(side * (0.078 - r * 0.008), 0.055 - r * 0.005, 0.12 + r * 0.08);
      chanfron.add(rivet);
    }
  }

  return chanfron;
}

/**
 * Builds one 3-segment articulated equine leg (`upper` -> `lower` -> `hoof`)
 * with anatomical musculature, knee/hock joint, cannon bone, fetlock, pastern, and iron-shod hoof.
 */
function buildEquineLeg(mats, coatMat, hairMat, isFront, isLeft) {
  const side = isLeft ? 1 : -1;
  const upper = new THREE.Group();
  upper.name = `${isFront ? 'front' : 'back'}_${isLeft ? 'left' : 'right'}_upper`;

  // 1. UPPER SEGMENT (Muscular Shoulder/Gaskin Thigh, length = 0.52m)
  const upperTopR = isFront ? 0.125 : 0.155;
  const upperBotR = isFront ? 0.068 : 0.076;
  const upperMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(upperTopR, upperBotR, 0.52, 14),
    coatMat
  );
  upperMesh.scale.set(0.88, 1, 1.18);
  upperMesh.position.set(0, -0.26, 0);
  upper.add(upperMesh);

  const muscleBulge = new THREE.Mesh(
    new THREE.SphereGeometry(upperTopR * 1.04, 12, 10),
    coatMat
  );
  muscleBulge.scale.set(0.85, 1.15, 1.22);
  muscleBulge.position.set(side * 0.015, -0.06, isFront ? 0.02 : -0.02);
  upper.add(muscleBulge);

  const kneeJoint = new THREE.Mesh(
    new THREE.SphereGeometry(upperBotR * 1.05, 10, 10),
    coatMat
  );
  kneeJoint.scale.set(0.92, 0.95, 1.12);
  kneeJoint.position.set(0, -0.52, isFront ? 0.008 : -0.015);
  upper.add(kneeJoint);

  // 2. LOWER SEGMENT (Slender Cannon Bone, length = 0.46m)
  const lower = new THREE.Group();
  lower.name = `${isFront ? 'front' : 'back'}_${isLeft ? 'left' : 'right'}_lower`;
  lower.position.set(0, -0.52, 0);
  upper.add(lower);

  const cannonMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.056, 0.044, 0.46, 12),
    coatMat
  );
  cannonMesh.scale.set(0.88, 1, 1.05);
  cannonMesh.position.set(0, -0.23, 0);
  lower.add(cannonMesh);

  const fetlockTuft = new THREE.Mesh(
    new THREE.ConeGeometry(0.046, 0.11, 8),
    hairMat
  );
  fetlockTuft.rotation.x = -0.38;
  fetlockTuft.position.set(0, -0.43, -0.032);
  lower.add(fetlockTuft);

  // 3. HOOF SEGMENT (Fetlock Joint + Angled Pastern + Flared Hoof + Iron Horseshoe, height = 0.20m)
  const hoof = new THREE.Group();
  hoof.name = `${isFront ? 'front' : 'back'}_${isLeft ? 'left' : 'right'}_hoof`;
  hoof.position.set(0, -0.46, 0);
  lower.add(hoof);

  const fetlockSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.048, 10, 8),
    coatMat
  );
  hoof.add(fetlockSphere);

  const pastern = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.048, 0.1, 10),
    coatMat
  );
  pastern.rotation.x = -0.32;
  pastern.position.set(0, -0.055, 0.018);
  hoof.add(pastern);

  const hoofWall = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.072, 0.1, 12),
    mats.hoofIron
  );
  hoofWall.scale.set(0.95, 1, 1.12);
  hoofWall.position.set(0, -0.145, 0.038);
  hoof.add(hoofWall);

  const horseshoe = new THREE.Mesh(
    new THREE.TorusGeometry(0.062, 0.009, 6, 12, Math.PI * 1.45),
    mats.steelPlate
  );
  horseshoe.rotation.x = Math.PI * 0.5;
  horseshoe.rotation.z = -Math.PI * 0.225;
  horseshoe.position.set(0, -0.192, 0.038);
  hoof.add(horseshoe);

  // Batch static sub-meshes within each joint segment, setting noMerge AFTER merging
  mergeStaticMeshesByMaterial(hoof, { castShadow: true, receiveShadow: true });
  hoof.userData.noMerge = true;

  mergeStaticMeshesByMaterial(lower, { castShadow: true, receiveShadow: true });
  lower.userData.noMerge = true;

  mergeStaticMeshesByMaterial(upper, { castShadow: true, receiveShadow: true });
  upper.userData.noMerge = true;

  return { upper, lower, hoof };
}

/**
 * Creates an anatomically detailed, articulated Medieval Warhorse (Destrier / Arabian Courser)
 * with 3-segment legs, 8-tuft mane, multi-strand tail, steel chanfron, contoured cloth caparison/barding,
 * high-cantle war saddle, stirrups, dynamic reins, and 4-beat gallop animation.
 *
 * Coordinate Convention: Faces +Z forward, with y = 0 at the bottom of the hooves.
 */
export function createWarhorse(options = {}) {
  const {
    coat = 'dapple_grey',
    faction = 'crusader',
    barding = true,
  } = options;

  const mats = getMaterials();

  const coatMat =
    coat === 'bay'
      ? mats.horseBay
      : coat === 'black'
      ? mats.horseBlack
      : coat === 'chestnut'
      ? mats.horseChestnut
      : mats.horseDappleGrey;

  const hairMat = coat === 'dapple_grey' ? mats.horseHairSilver : mats.horseHairDark;

  const caparisonMat =
    faction === 'companion'
      ? mats.companionSurcoat
      : faction === 'saracen'
      ? mats.saracenRoyalTunic
      : mats.crusaderSurcoat;

  const root = new THREE.Group();
  root.name = `Warhorse_${faction}_${coat}`;

  // ── 1. SCULPTED EQUINE BODY GROUP (y = 1.28) ──
  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'bodyGroup';
  bodyGroup.position.set(0, 1.28, 0);
  root.add(bodyGroup);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.34, 1.08, 20),
    coatMat
  );
  barrel.rotation.x = Math.PI * 0.5;
  barrel.scale.set(0.92, 1, 1.06);
  barrel.position.set(0, 0.0, 0.02);
  bodyGroup.add(barrel);

  const chest = new THREE.Mesh(
    new THREE.SphereGeometry(0.375, 18, 16),
    coatMat
  );
  chest.scale.set(0.92, 1.06, 1.02);
  chest.position.set(0, 0.02, 0.48);
  bodyGroup.add(chest);

  const withers = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 14, 12),
    coatMat
  );
  withers.scale.set(0.82, 0.95, 1.25);
  withers.position.set(0, 0.18, 0.38);
  bodyGroup.add(withers);

  const croup = new THREE.Mesh(
    new THREE.SphereGeometry(0.385, 18, 16),
    coatMat
  );
  croup.scale.set(0.94, 1.06, 1.12);
  croup.position.set(0, 0.05, -0.52);
  bodyGroup.add(croup);

  for (const side of [-1, 1]) {
    const hipMuscle = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 10),
      coatMat
    );
    hipMuscle.scale.set(0.68, 1.12, 1.15);
    hipMuscle.position.set(side * (barding ? 0.16 : 0.21), -0.04, -0.52);
    bodyGroup.add(hipMuscle);

    const shoulderMuscle = new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 12, 10),
      coatMat
    );
    shoulderMuscle.scale.set(0.66, 1.15, 1.08);
    shoulderMuscle.position.set(side * (barding ? 0.165 : 0.22), -0.04, 0.48);
    bodyGroup.add(shoulderMuscle);
  }

  // ── 2. ARCHED NECK WITH 8 SCULPTED MANE TUFTS, HEAD, JAW & STEEL CHANFRON ──
  const neckGroup = new THREE.Group();
  neckGroup.name = 'neckGroup';
  neckGroup.position.set(0, 0.16, 0.56);
  neckGroup.rotation.x = 0.56;
  bodyGroup.add(neckGroup);

  const neckMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.155, 0.245, 0.68, 16),
    coatMat
  );
  neckMesh.scale.set(0.78, 1, 1.15);
  neckMesh.position.set(0, 0.3, 0.02);
  neckGroup.add(neckMesh);

  const neckCrest = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.17, 0.64, 12),
    coatMat
  );
  neckCrest.scale.set(0.65, 1, 0.9);
  neckCrest.position.set(0, 0.32, -0.05);
  neckCrest.rotation.x = 0.08;
  neckGroup.add(neckCrest);

  // 8 Sculpted Flowing Mane Tufts along the dorsal crest of the neck (batched into neckGroup)
  for (let m = 0; m < 8; m++) {
    const frac = m / 7;
    const tuft = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.22 - frac * 0.04, 8),
      hairMat
    );
    tuft.scale.set(0.45, 1, 1.4);
    tuft.position.set(
      (m % 2 === 0 ? 1 : -1) * 0.025,
      0.06 + frac * 0.54,
      -0.14 + frac * 0.04
    );
    tuft.rotation.x = -0.82;
    tuft.rotation.z = (m % 2 === 0 ? 1 : -1) * 0.28;
    neckGroup.add(tuft);
  }

  if (barding) {
    const crinet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.158, 0.248, 0.52, 14, 1, true, -Math.PI * 0.58, Math.PI * 1.16),
      faction === 'saracen' ? mats.saracenLamellar : mats.chainmail
    );
    crinet.scale.set(0.81, 1, 1.16);
    crinet.position.set(0, 0.26, 0.025);
    neckGroup.add(crinet);
  }

  // HEAD GROUP at top of neck
  const headGroup = new THREE.Group();
  headGroup.name = 'headGroup';
  headGroup.position.set(0, 0.6, 0.05);
  headGroup.rotation.x = -0.32;
  neckGroup.add(headGroup);

  const cranium = new THREE.Mesh(
    new THREE.SphereGeometry(0.145, 14, 12),
    coatMat
  );
  cranium.scale.set(0.84, 0.88, 1.15);
  cranium.position.set(0, 0.02, 0.05);
  headGroup.add(cranium);

  const nasalBridge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.072, 0.125, 0.38, 14),
    coatMat
  );
  nasalBridge.rotation.x = Math.PI * 0.52;
  nasalBridge.scale.set(0.82, 1, 0.88);
  nasalBridge.position.set(0, 0.01, 0.24);
  headGroup.add(nasalBridge);

  const snout = new THREE.Mesh(
    new THREE.SphereGeometry(0.078, 12, 10),
    coatMat
  );
  snout.scale.set(0.88, 0.78, 1.05);
  snout.position.set(0, -0.005, 0.43);
  headGroup.add(snout);

  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 10, 10),
      coatMat
    );
    cheek.scale.set(0.55, 0.92, 1.15);
    cheek.position.set(side * 0.075, -0.02, 0.09);
    headGroup.add(cheek);

    const browRidge = new THREE.Mesh(
      new THREE.SphereGeometry(0.036, 8, 8),
      coatMat
    );
    browRidge.scale.set(0.8, 0.65, 1.3);
    browRidge.position.set(side * 0.092, 0.058, 0.14);
    headGroup.add(browRidge);

    const eyeBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 10, 10),
      mats.visorSlit
    );
    eyeBall.position.set(side * 0.096, 0.042, 0.145);
    headGroup.add(eyeBall);

    const nostrilRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.022, 0.007, 6, 10),
      coatMat
    );
    nostrilRim.position.set(side * 0.048, 0.012, 0.44);
    nostrilRim.rotation.y = side * 0.55;
    headGroup.add(nostrilRim);

    const nostrilCavity = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 8, 8),
      mats.visorSlit
    );
    nostrilCavity.scale.set(0.6, 1, 1.1);
    nostrilCavity.position.set(side * 0.046, 0.012, 0.442);
    headGroup.add(nostrilCavity);
  }

  // Two Alert Pointed Equine Ears at Poll (batched into headGroup)
  for (const side of [-1, 1]) {
    const earGroup = new THREE.Group();
    earGroup.position.set(side * 0.072, 0.115, -0.01);
    earGroup.rotation.z = -side * 0.24;
    earGroup.rotation.x = 0.22;
    headGroup.add(earGroup);

    const earCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.032, 0.13, 8),
      coatMat
    );
    earCone.scale.set(0.65, 1, 0.85);
    earCone.position.y = 0.06;
    earGroup.add(earCone);

    const innerEar = new THREE.Mesh(
      new THREE.ConeGeometry(0.018, 0.09, 6),
      mats.leatherDark
    );
    innerEar.scale.set(0.5, 1, 0.4);
    innerEar.position.set(0, 0.055, 0.012);
    earGroup.add(innerEar);
  }

  const forelock = new THREE.Mesh(
    new THREE.ConeGeometry(0.038, 0.14, 8),
    hairMat
  );
  forelock.rotation.x = Math.PI * 0.62;
  forelock.position.set(0, 0.11, 0.08);
  headGroup.add(forelock);

  // Hinged Lower Jaw (`jawGroup`): Raised snugly so mouth is closed at idle
  const jawGroup = new THREE.Group();
  jawGroup.name = 'jawGroup';
  jawGroup.position.set(0, -0.02, 0.11);
  headGroup.add(jawGroup);

  const mandible = new THREE.Mesh(
    new THREE.CylinderGeometry(0.048, 0.082, 0.31, 10),
    coatMat
  );
  mandible.rotation.x = Math.PI * 0.47;
  mandible.scale.set(0.76, 1, 0.72);
  mandible.position.set(0, 0.004, 0.15);
  jawGroup.add(mandible);

  const chin = new THREE.Mesh(
    new THREE.SphereGeometry(0.048, 8, 8),
    coatMat
  );
  chin.scale.set(0.82, 0.7, 1.0);
  chin.position.set(0, 0.008, 0.3);
  jawGroup.add(chin);

  mergeStaticMeshesByMaterial(jawGroup, { castShadow: true, receiveShadow: true });
  jawGroup.userData.noMerge = true;

  const chanfron = buildChanfron(mats, faction);
  headGroup.add(chanfron);

  const noseband = new THREE.Mesh(
    new THREE.TorusGeometry(0.082, 0.009, 6, 14),
    mats.leatherDark
  );
  noseband.scale.set(0.88, 0.92, 1);
  noseband.position.set(0, 0.0, 0.34);
  headGroup.add(noseband);

  for (const side of [-1, 1]) {
    const cheekStrap = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.018, 0.34),
      mats.leatherDark
    );
    cheekStrap.position.set(side * 0.084, 0.01, 0.21);
    cheekStrap.rotation.y = -side * 0.08;
    cheekStrap.rotation.x = 0.12;
    headGroup.add(cheekStrap);

    const bitRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.026, 0.005, 6, 12),
      mats.gildedBrass
    );
    bitRing.rotation.y = Math.PI * 0.5;
    bitRing.position.set(side * 0.072, -0.024, 0.37);
    headGroup.add(bitRing);
  }

  mergeStaticMeshesByMaterial(headGroup, { castShadow: true, receiveShadow: true });
  headGroup.userData.noMerge = true;

  mergeStaticMeshesByMaterial(neckGroup, { castShadow: true, receiveShadow: true });
  neckGroup.userData.noMerge = true;

  // ── 3. MULTI-STRAND FLOWING HORSE TAIL (`tailGroup` at -Z rear) ──
  const tailGroup = new THREE.Group();
  tailGroup.name = 'tailGroup';
  tailGroup.position.set(0, 0.18, -0.86);
  bodyGroup.add(tailGroup);

  const tailDock = new THREE.Mesh(
    new THREE.CylinderGeometry(0.048, 0.062, 0.22, 10),
    hairMat
  );
  tailDock.rotation.x = 0.55;
  tailDock.position.set(0, -0.08, -0.06);
  tailGroup.add(tailDock);

  const strandConfigs = [
    { x: 0, y: -0.38, z: -0.16, len: 0.68, rx: 0.28, rz: 0 },
    { x: 0.038, y: -0.36, z: -0.14, len: 0.62, rx: 0.25, rz: 0.12 },
    { x: -0.038, y: -0.36, z: -0.14, len: 0.62, rx: 0.25, rz: -0.12 },
    { x: 0.022, y: -0.44, z: -0.19, len: 0.58, rx: 0.34, rz: 0.06 },
    { x: -0.022, y: -0.44, z: -0.19, len: 0.58, rx: 0.34, rz: -0.06 },
  ];
  for (const sc of strandConfigs) {
    const strand = new THREE.Mesh(
      new THREE.ConeGeometry(0.056, sc.len, 10),
      hairMat
    );
    strand.scale.set(0.75, 1, 1.15);
    strand.position.set(sc.x, sc.y, sc.z);
    strand.rotation.x = Math.PI - sc.rx;
    strand.rotation.z = sc.rz;
    tailGroup.add(strand);
  }
  mergeStaticMeshesByMaterial(tailGroup, { castShadow: true, receiveShadow: true });
  tailGroup.userData.noMerge = true;

  // ── 4. CONTOURED CAPARISON BARDING, HIGH-CANTLE WAR SADDLE, STIRRUPS & REINS ──
  const bardingGroup = new THREE.Group();
  bardingGroup.name = 'bardingGroup';
  bardingGroup.visible = Boolean(barding);
  bodyGroup.add(bardingGroup);

  if (barding) {
    const frontCaparison = new THREE.Mesh(
      new THREE.CylinderGeometry(0.365, 0.415, 0.58, 20, 1, true, -Math.PI * 0.65, Math.PI * 1.3),
      caparisonMat
    );
    frontCaparison.scale.set(0.95, 1, 1.04);
    frontCaparison.position.set(0, -0.11, 0.45);
    bardingGroup.add(frontCaparison);

    const rearCaparison = new THREE.Mesh(
      new THREE.CylinderGeometry(0.375, 0.435, 0.62, 20, 1, true, Math.PI * 0.32, Math.PI * 1.36),
      caparisonMat
    );
    rearCaparison.scale.set(0.95, 1, 1.12);
    rearCaparison.position.set(0, -0.09, -0.48);
    bardingGroup.add(rearCaparison);

    for (const side of [-1, 1]) {
      const flankSkirt = createContouredFlankCaparison(mats, caparisonMat, side);
      flankSkirt.userData.noMerge = false;
      bardingGroup.add(flankSkirt);
    }
  }

  // Snug Contoured Breastcollar & Chest Phalera Medallion flush against the front chest
  const breastPts = [];
  for (let i = 0; i <= 16; i++) {
    const a = -Math.PI * 0.58 + (i / 16) * Math.PI * 1.16;
    const x = Math.sin(a) * 0.358;
    const z = 0.47 + Math.cos(a) * 0.382;
    const y = 0.02 - Math.cos(a) * 0.03;
    breastPts.push(new THREE.Vector3(x, y, z));
  }
  const breastCurve = new THREE.CatmullRomCurve3(breastPts, false);
  const breastCollar = new THREE.Mesh(
    new THREE.TubeGeometry(breastCurve, 20, 0.016, 6, false),
    mats.leatherDark
  );
  bodyGroup.add(breastCollar);

  const chestMedallion = new THREE.Mesh(
    new THREE.CylinderGeometry(0.052, 0.052, 0.016, 14),
    mats.gildedBrass
  );
  chestMedallion.rotation.x = Math.PI * 0.52;
  chestMedallion.position.set(0, -0.01, 0.855);
  bodyGroup.add(chestMedallion);

  // High-Cantle Medieval War Saddle at y ≈ 1.44 world height (0.16 above bodyGroup.y = 1.28)
  const saddleGroup = new THREE.Group();
  saddleGroup.name = 'saddleGroup';
  saddleGroup.position.set(0, 0.16, -0.02);
  bodyGroup.add(saddleGroup);

  const saddleBlanket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.37, 0.39, 0.66, 16, 1, false, -Math.PI * 0.4, Math.PI * 0.8),
    caparisonMat
  );
  saddleBlanket.rotation.z = Math.PI * 0.5;
  saddleBlanket.rotation.y = Math.PI * 0.5;
  saddleBlanket.position.set(0, -0.14, 0);
  saddleGroup.add(saddleBlanket);

  const saddleSeat = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.055, 0.48),
    mats.leatherSaddle
  );
  saddleSeat.position.set(0, 0.0, 0);
  saddleGroup.add(saddleSeat);

  const pommelArch = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.18, 0.055),
    mats.leatherSaddle
  );
  pommelArch.position.set(0, 0.095, 0.21);
  pommelArch.rotation.x = 0.18;
  saddleGroup.add(pommelArch);

  const pommelBrassPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.15, 0.016),
    mats.gildedBrass
  );
  pommelBrassPlate.position.set(0, 0.1, 0.24);
  pommelBrassPlate.rotation.x = 0.18;
  saddleGroup.add(pommelBrassPlate);

  const cantleArch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.19, 0.21, 14, 1, false, Math.PI * 0.65, Math.PI * 0.7),
    mats.leatherSaddle
  );
  cantleArch.position.set(0, 0.1, -0.14);
  cantleArch.rotation.x = -0.16;
  saddleGroup.add(cantleArch);

  const cantleTrim = new THREE.Mesh(
    new THREE.TorusGeometry(0.182, 0.012, 8, 14, Math.PI * 0.7),
    mats.gildedBrass
  );
  cantleTrim.rotation.x = Math.PI * 0.5 - 0.16;
  cantleTrim.rotation.z = Math.PI * 0.15;
  cantleTrim.position.set(0, 0.2, -0.155);
  saddleGroup.add(cantleTrim);

  const girthStrap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.368, 0.368, 0.08, 18),
    mats.leatherDark
  );
  girthStrap.rotation.x = Math.PI * 0.5;
  girthStrap.scale.set(0.94, 1, 1.07);
  girthStrap.position.set(0, -0.16, 0.12);
  saddleGroup.add(girthStrap);

  for (const side of [-1, 1]) {
    const sGroup = new THREE.Group();
    sGroup.position.set(side * 0.25, -0.02, 0.02);
    saddleGroup.add(sGroup);

    const leatherStrap = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.52, 0.032),
      mats.leatherDark
    );
    leatherStrap.position.set(side * 0.02, -0.26, -0.02);
    sGroup.add(leatherStrap);

    const stirrupIron = new THREE.Mesh(
      new THREE.TorusGeometry(0.056, 0.008, 6, 12, Math.PI * 1.2),
      mats.steelPlate
    );
    stirrupIron.rotation.y = Math.PI * 0.5;
    stirrupIron.rotation.z = -Math.PI * 0.1;
    stirrupIron.position.set(side * 0.025, -0.52, -0.02);
    sGroup.add(stirrupIron);

    const stirrupTread = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.01, 0.11),
      mats.darkIron
    );
    stirrupTread.position.set(side * 0.025, -0.56, -0.02);
    sGroup.add(stirrupTread);
  }

  const saddleMountPoint = new THREE.Group();
  saddleMountPoint.name = 'saddleMountPoint';
  saddleMountPoint.position.set(0, 0.03, -0.02);
  saddleMountPoint.userData.noMerge = true;
  saddleGroup.add(saddleMountPoint);

  // Dynamic Leather Reins connecting from Bit Rings back to the Saddle Pommel
  const reinsGroup = new THREE.Group();
  reinsGroup.name = 'reinsGroup';
  bodyGroup.add(reinsGroup);

  for (const side of [-1, 1]) {
    const rein = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, 0.88, 6),
      mats.leatherDark
    );
    rein.position.set(side * 0.13, 0.42, 0.48);
    rein.rotation.x = Math.PI * 0.37;
    rein.rotation.z = side * 0.08;
    reinsGroup.add(rein);
  }

  // ── 5. FOUR 3-SEGMENT ARTICULATED EQUINE LEGS (`fl`, `fr`, `bl`, `br`) ──
  const fl = buildEquineLeg(mats, coatMat, hairMat, true, true);
  fl.upper.position.set(0.21, -0.1, 0.52);
  bodyGroup.add(fl.upper);

  const fr = buildEquineLeg(mats, coatMat, hairMat, true, false);
  fr.upper.position.set(-0.21, -0.1, 0.52);
  bodyGroup.add(fr.upper);

  const bl = buildEquineLeg(mats, coatMat, hairMat, false, true);
  bl.upper.position.set(0.22, -0.1, -0.52);
  bodyGroup.add(bl.upper);

  const br = buildEquineLeg(mats, coatMat, hairMat, false, false);
  br.upper.position.set(-0.22, -0.1, -0.52);
  bodyGroup.add(br.upper);

  const legs = { fl, fr, bl, br };

  mergeStaticMeshesByMaterial(bodyGroup, { castShadow: true, receiveShadow: true });
  enableShadows(root, true, true);

  // ── 6. REALISTIC 4-BEAT GALLOP, TROT, WALK, IDLE & REAR-UP ANIMATION ──
  let internalTime = Math.random() * 10;
  const phaseOffsets = {
    fl: 0.0,
    fr: 0.35,
    bl: 0.5,
    br: 0.85,
  };

  function animateSingleLeg(leg, phaseRad, strideAmp, isFront) {
    const s = Math.sin(phaseRad);
    const c = Math.cos(phaseRad);
    const lift = Math.max(0, c);

    leg.upper.rotation.x = -s * 0.68 * strideAmp;

    if (isFront) {
      leg.lower.rotation.x = lift * 1.12 * strideAmp + 0.05 * strideAmp;
      leg.hoof.rotation.x = lift * 0.55 * strideAmp - Math.max(0, -c) * 0.22 * strideAmp;
    } else {
      leg.lower.rotation.x = lift * 0.88 * strideAmp + Math.max(0, -s) * 0.25 * strideAmp;
      leg.hoof.rotation.x = lift * 0.62 * strideAmp - Math.max(0, -c) * 0.28 * strideAmp;
    }
  }

  function updateAnimation(dt = 0.016, horseState = {}) {
    internalTime += dt;
    const t = horseState.time !== undefined ? horseState.time : internalTime;
    const speed = horseState.speed || 0;
    const rearProgress = horseState.rearProgress || 0;
    const turnRate = horseState.turnRate || 0;

    if (rearProgress > 0.01) {
      const rp = Math.sin(rearProgress * Math.PI);
      bodyGroup.position.y = 1.28 + rp * 0.42;
      bodyGroup.position.z = -rp * 0.24;
      bodyGroup.rotation.x = -rp * 0.78;
      bodyGroup.rotation.z = Math.sin(t * 4) * 0.04 * rp;

      neckGroup.rotation.x = 0.56 + rp * 0.35;
      headGroup.rotation.x = -0.32 - rp * 0.25;
      jawGroup.rotation.x = rp * 0.25;

      const paw = Math.sin(t * 9.5);
      fl.upper.rotation.x = -0.85 * rp + paw * 0.38 * rp;
      fl.lower.rotation.x = (0.95 + Math.max(0, paw) * 0.45) * rp;
      fl.hoof.rotation.x = 0.4 * rp;

      fr.upper.rotation.x = -0.85 * rp - paw * 0.38 * rp;
      fr.lower.rotation.x = (0.95 + Math.max(0, -paw) * 0.45) * rp;
      fr.hoof.rotation.x = 0.4 * rp;

      bl.upper.rotation.x = 0.58 * rp;
      bl.lower.rotation.x = 0.22 * rp;
      bl.hoof.rotation.x = -0.1 * rp;

      br.upper.rotation.x = 0.58 * rp;
      br.lower.rotation.x = 0.22 * rp;
      br.hoof.rotation.x = -0.1 * rp;

      tailGroup.rotation.x = 0.45 * rp;
      return;
    }

    const strideAmp = Math.min(1.15, speed / 9.5);
    const freq = 1.4 + speed * 0.22;
    const basePhase = t * freq * Math.PI * 2;

    if (speed > 0.15) {
      const gallopWave = Math.sin(basePhase);
      const gallopCos = Math.cos(basePhase);

      bodyGroup.position.y = 1.28 + Math.abs(gallopWave) * 0.085 * strideAmp;
      bodyGroup.position.z = 0;
      bodyGroup.rotation.x = gallopCos * 0.095 * strideAmp;
      bodyGroup.rotation.z = -turnRate * 0.14 + Math.sin(basePhase * 0.5) * 0.025 * strideAmp;

      neckGroup.rotation.x = 0.56 + Math.sin(basePhase - 0.6) * 0.14 * strideAmp;
      neckGroup.rotation.y = turnRate * 0.25;
      headGroup.rotation.x = -0.32 - Math.sin(basePhase - 0.6) * 0.1 * strideAmp;
      jawGroup.rotation.x = Math.min(0.08, strideAmp * 0.04 + Math.abs(gallopWave) * 0.03);

      animateSingleLeg(fl, basePhase + phaseOffsets.fl * Math.PI * 2, strideAmp, true);
      animateSingleLeg(fr, basePhase + phaseOffsets.fr * Math.PI * 2, strideAmp, true);
      animateSingleLeg(bl, basePhase + phaseOffsets.bl * Math.PI * 2, strideAmp, false);
      animateSingleLeg(br, basePhase + phaseOffsets.br * Math.PI * 2, strideAmp, false);

      tailGroup.rotation.x = Math.min(0.68, strideAmp * 0.55) + Math.sin(basePhase) * 0.12 * strideAmp;
      tailGroup.rotation.y = Math.sin(t * 5.5) * 0.18 * strideAmp;
    } else {
      const breath = Math.sin(t * 2.1);
      bodyGroup.position.set(0, 1.28 + breath * 0.008, 0);
      bodyGroup.rotation.set(0, 0, 0);

      neckGroup.rotation.x = 0.56 + Math.sin(t * 1.3) * 0.035;
      neckGroup.rotation.y = Math.sin(t * 0.7) * 0.06;
      headGroup.rotation.x = -0.32 + Math.cos(t * 1.3) * 0.04;
      jawGroup.rotation.x = 0;

      for (const key of ['fl', 'fr', 'bl', 'br']) {
        legs[key].upper.rotation.set(0, 0, 0);
        legs[key].lower.rotation.set(0, 0, 0);
        legs[key].hoof.rotation.set(0, 0, 0);
      }

      tailGroup.rotation.x = 0.08 + Math.sin(t * 1.6) * 0.04;
      tailGroup.rotation.y = Math.sin(t * 2.2) * 0.14;
    }
  }

  return {
    root,
    bodyGroup,
    neckGroup,
    headGroup,
    jawGroup,
    tailGroup,
    saddleMountPoint,
    legs,
    fl,
    fr,
    bl,
    br,
    bardingGroup,
    reinsGroup,
    updateAnimation,
  };
}
