import * as THREE from '../vendor/three.module.js';
import { getMaterials } from '../graphics/ProceduralTextures.js';
import { registerWindCloth, mergeStaticMeshesByMaterial } from '../graphics/PostProcessing.js';

/**
 * Enables shadow casting and receiving on all meshes within a hierarchy.
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
 * Creates a curved cylindrical shell segment whose UVs are cleanly mapped [uMin..uMax]
 * across the arc so heraldic crosses and medallions sit 100% centered without clipping.
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
    18,
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
 * Builds a curved 13th-century Heater Shield geometry with authentic horizontal curvature
 * and a tapered teardrop lower point. Front face normal points along +Z.
 */
function createCurvedHeaterShieldGeometry(width = 0.54, height = 0.76, curvature = 0.095) {
  const segsX = 12;
  const segsY = 16;
  const geom = new THREE.PlaneGeometry(width, height, segsX, segsY);
  const pos = geom.attributes.position;
  const uvs = geom.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const u = uvs.getX(i); // 0..1
    const v = uvs.getY(i); // 0..1 (0 = bottom tip, 1 = flat top)

    let widthScale = 1.0;
    if (v < 0.68) {
      const t = v / 0.68;
      widthScale = Math.pow(t, 0.72);
    } else {
      const t = (v - 0.68) / 0.32;
      widthScale = 1.0 - 0.04 * t * t;
    }

    let yOffset = 0;
    const nx = (u - 0.5) * 2;
    if (v > 0.85) {
      yOffset = (1 - nx * nx) * 0.015 * ((v - 0.85) / 0.15);
    }

    const x = nx * (width * 0.5) * widthScale;
    const y = (v - 0.5) * height + yOffset;
    const z = (1 - nx * nx * widthScale) * curvature;

    pos.setXYZ(i, x, y, z);
  }

  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds the iconic 12th/13th-century Crusader Flat-Top / Sugarloaf Barrel Great Helm
 * with recessed ocular slits, 24 ventail breathing perforations, riveted gilded-brass
 * facial cross, chainmail coif collar, and optional regal Companion crest/crown.
 */
function buildGreatHelm(mats, { isPlayer, isCompanion, variant }) {
  const headGroup = new THREE.Group();
  headGroup.name = 'headGroup';

  // 1. Chainmail Coif & Mantling Collar draping over neck and upper shoulders
  const coifNeck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.115, 0.145, 0.18, 18),
    mats.chainmail
  );
  coifNeck.position.set(0, 0.05, -0.005);
  headGroup.add(coifNeck);

  const coifMantle = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.12, 20, 1, true),
    mats.chainmail
  );
  coifMantle.position.set(0, 0.01, 0);
  headGroup.add(coifMantle);

  // Scalloped dagged border on chainmail coif edge
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const dag = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.035, 0.018),
      mats.chainmail
    );
    dag.position.set(Math.sin(angle) * 0.2, -0.04, Math.cos(angle) * 0.2);
    dag.rotation.y = angle;
    dag.rotation.x = 0.35;
    headGroup.add(dag);
  }

  // 2. Main Great Helm Barrel Bowl (multi-part steel cylinder + tapered upper dome + angled visor plate)
  const helmGroup = new THREE.Group();
  helmGroup.position.set(0, 0.19, 0);
  headGroup.add(helmGroup);

  const mainBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.136, 0.144, 0.25, 24),
    mats.steelPlate
  );
  mainBarrel.scale.set(0.95, 1, 1.08);
  helmGroup.add(mainBarrel);

  // Angled prow-like front visor faceplate (+Z forward)
  const frontFacePoints = [
    new THREE.Vector2(0.001, 0.13),
    new THREE.Vector2(0.138, 0.125),
    new THREE.Vector2(0.148, 0.015),
    new THREE.Vector2(0.142, -0.125),
    new THREE.Vector2(0.001, -0.125),
  ];
  const frontVisor = new THREE.Mesh(
    new THREE.LatheGeometry(frontFacePoints, 16, -Math.PI * 0.45, Math.PI * 0.9),
    mats.steelPlate
  );
  frontVisor.rotation.y = Math.PI * 0.5;
  frontVisor.position.z = 0.012;
  helmGroup.add(frontVisor);

  // Slightly conical crown cap on top of the Great Helm
  const crownCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.118, 0.136, 0.055, 24),
    mats.steelPlate
  );
  crownCap.scale.set(0.95, 1, 1.08);
  crownCap.position.y = 0.15;
  helmGroup.add(crownCap);

  // Top flat-domed lid
  const topDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.116, 0.118, 0.014, 24),
    isPlayer || isCompanion ? mats.gildedBrass : mats.steelPlate
  );
  topDisc.scale.set(0.95, 1, 1.08);
  topDisc.position.y = 0.18;
  helmGroup.add(topDisc);

  // Crown rim reinforcement band & lower gorget rim band
  const upperBand = new THREE.Mesh(
    new THREE.TorusGeometry(0.136, 0.009, 8, 24),
    isPlayer || isCompanion ? mats.gildedBrass : mats.steelPlate
  );
  upperBand.rotation.x = Math.PI * 0.5;
  upperBand.scale.set(0.95, 1.08, 1);
  upperBand.position.y = 0.122;
  helmGroup.add(upperBand);

  const lowerRimBand = new THREE.Mesh(
    new THREE.TorusGeometry(0.144, 0.009, 8, 24),
    mats.gildedBrass
  );
  lowerRimBand.rotation.x = Math.PI * 0.5;
  lowerRimBand.scale.set(0.95, 1.08, 1);
  lowerRimBand.position.y = -0.122;
  helmGroup.add(lowerRimBand);

  // 3. Recessed Pitch-Black Ocular Slits (Left & Right vision slits facing +Z)
  const slitWidth = 0.064;
  const slitHeight = 0.016;
  for (const side of [-1, 1]) {
    const slit = new THREE.Mesh(
      new THREE.BoxGeometry(slitWidth, slitHeight, 0.022),
      mats.visorSlit
    );
    slit.position.set(side * 0.048, 0.036, 0.149);
    slit.rotation.y = side * 0.24;
    helmGroup.add(slit);

    const browBar = new THREE.Mesh(
      new THREE.BoxGeometry(slitWidth + 0.01, 0.01, 0.028),
      mats.steelPlate
    );
    browBar.position.set(side * 0.048, 0.048, 0.151);
    browBar.rotation.y = side * 0.24;
    helmGroup.add(browBar);

    const lowerBar = new THREE.Mesh(
      new THREE.BoxGeometry(slitWidth + 0.008, 0.007, 0.026),
      mats.steelPlate
    );
    lowerBar.position.set(side * 0.048, 0.025, 0.15);
    lowerBar.rotation.y = side * 0.24;
    helmGroup.add(lowerBar);
  }

  // 4. Raised Riveted Gilded-Brass Facial Cross across the front (+Z) of the Great Helm
  const verticalCrossStem = new THREE.Mesh(
    new THREE.BoxGeometry(0.026, 0.248, 0.018),
    mats.gildedBrass
  );
  verticalCrossStem.position.set(0, 0.0, 0.156);
  helmGroup.add(verticalCrossStem);

  for (const ty of [0.112, -0.112]) {
    const terminal = new THREE.Mesh(
      new THREE.BoxGeometry(0.048, 0.022, 0.019),
      mats.gildedBrass
    );
    terminal.position.set(0, ty, 0.154);
    helmGroup.add(terminal);
  }

  for (const side of [-1, 1]) {
    const horizArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.082, 0.02, 0.016),
      mats.gildedBrass
    );
    horizArm.position.set(side * 0.052, 0.036, 0.148);
    horizArm.rotation.y = side * 0.24;
    helmGroup.add(horizArm);

    const serif = new THREE.Mesh(
      new THREE.BoxGeometry(0.016, 0.044, 0.018),
      mats.gildedBrass
    );
    serif.position.set(side * 0.092, 0.036, 0.137);
    serif.rotation.y = side * 0.35;
    helmGroup.add(serif);
  }

  const rivetGeo = new THREE.SphereGeometry(0.0055, 8, 6);
  const rivetPositions = [
    [0, 0.105, 0.165],
    [0, 0.072, 0.165],
    [0, 0.036, 0.166],
    [0, 0.0, 0.165],
    [0, -0.038, 0.165],
    [0, -0.075, 0.165],
    [0, -0.108, 0.165],
    [-0.035, 0.036, 0.158],
    [-0.075, 0.036, 0.148],
    [0.035, 0.036, 0.158],
    [0.075, 0.036, 0.148],
  ];
  for (const [rx, ry, rz] of rivetPositions) {
    const rivet = new THREE.Mesh(rivetGeo, mats.gildedBrass);
    rivet.position.set(rx, ry, rz);
    helmGroup.add(rivet);
  }

  // 5. 24 Ventail Breathing Perforations on the lower faceplate (12 on each side)
  const holeGeo = new THREE.CylinderGeometry(0.0048, 0.0048, 0.012, 8);
  holeGeo.rotateX(Math.PI * 0.5);
  const rows = [-0.018, -0.044, -0.07, -0.094];
  const cols = [0.032, 0.056, 0.08];
  for (const side of [-1, 1]) {
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < cols.length; c++) {
        const angle = side * (0.22 + c * 0.16);
        const radius = 0.152;
        const hole = new THREE.Mesh(holeGeo, mats.visorSlit);
        hole.position.set(
          Math.sin(angle) * radius * 0.95,
          rows[r] + (c % 2 === 1 ? 0.006 : 0),
          Math.cos(angle) * radius * 1.06
        );
        hole.rotation.y = angle;
        helmGroup.add(hole);
      }
    }
  }

  // 6. Regal Heraldic Crest / Golden Crown Torse for Companions (and subtle crown crest for Player)
  if (isCompanion || variant === 'companion') {
    const torseSegments = 16;
    for (let i = 0; i < torseSegments; i++) {
      const a = (i / torseSegments) * Math.PI * 2;
      const bead = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 8, 8),
        i % 2 === 0 ? mats.gildedBrass : mats.capeCrimson
      );
      bead.position.set(Math.sin(a) * 0.118, 0.182, Math.cos(a) * 0.128);
      bead.scale.set(1, 0.85, 1.2);
      helmGroup.add(bead);
    }

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.016, 0.055, 4),
        mats.gildedBrass
      );
      spike.position.set(Math.sin(a) * 0.115, 0.215, Math.cos(a) * 0.125);
      spike.rotation.y = a;
      helmGroup.add(spike);
    }

    const plumeGroup = new THREE.Group();
    plumeGroup.position.set(0, 0.2, 0.02);
    helmGroup.add(plumeGroup);

    for (let p = 0; p < 7; p++) {
      const frac = p / 6;
      const feather = new THREE.Mesh(
        new THREE.ConeGeometry(0.026, 0.24 - frac * 0.04, 8),
        p % 2 === 0 ? mats.capeCompanionGold : mats.gildedBrass
      );
      feather.scale.set(0.45, 1, 1.35);
      feather.position.set(
        (p % 2 === 0 ? 1 : -1) * 0.008,
        0.09 - frac * 0.03,
        0.04 - frac * 0.16
      );
      feather.rotation.x = -0.35 - frac * 0.85;
      plumeGroup.add(feather);
    }
  } else if (isPlayer) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const point = new THREE.Mesh(
        new THREE.ConeGeometry(0.011, 0.032, 4),
        mats.gildedBrass
      );
      point.position.set(Math.sin(a) * 0.118, 0.192, Math.cos(a) * 0.128);
      point.rotation.y = a;
      helmGroup.add(point);
    }
  }

  // Batch static sub-meshes of the Great Helm by material
  mergeStaticMeshesByMaterial(headGroup, { castShadow: true, receiveShadow: true });
  headGroup.userData.noMerge = true;

  return headGroup;
}

/**
 * Builds the Cruciform Knightly Broadsword (Oakeshott Type XII) with central fuller groove,
 * flared brass crossguard, cord-wrapped leather grip, and chamfered wheel pommel.
 */
export function buildCruciformSword(mats) {
  const swordMesh = new THREE.Group();
  swordMesh.name = 'swordMesh';

  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.019, 0.16, 12),
    mats.leatherDark
  );
  grip.position.y = -0.02;
  swordMesh.add(grip);

  for (const gy of [-0.07, -0.02, 0.03]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.0185, 0.003, 6, 12),
      mats.gildedBrass
    );
    ring.rotation.x = Math.PI * 0.5;
    ring.position.y = gy;
    swordMesh.add(ring);
  }

  const pommel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.034, 0.034, 0.022, 16),
    mats.gildedBrass
  );
  pommel.rotation.z = Math.PI * 0.5;
  pommel.position.y = -0.12;
  swordMesh.add(pommel);

  const pommelBoss = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.024, 0.028, 12),
    mats.steelPlate
  );
  pommelBoss.rotation.z = Math.PI * 0.5;
  pommelBoss.position.y = -0.12;
  swordMesh.add(pommelBoss);

  const crossguard = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.024, 0.032),
    mats.gildedBrass
  );
  crossguard.position.y = 0.068;
  swordMesh.add(crossguard);

  for (const side of [-1, 1]) {
    const quillonTip = new THREE.Mesh(
      new THREE.BoxGeometry(0.032, 0.034, 0.036),
      mats.gildedBrass
    );
    quillonTip.position.set(side * 0.12, 0.066, 0);
    quillonTip.rotation.z = side * 0.18;
    swordMesh.add(quillonTip);
  }

  const bladeLen = 0.84;
  const blade = new THREE.Mesh(
    new THREE.ConeGeometry(0.034, bladeLen, 4),
    mats.polishedBlade
  );
  blade.scale.set(1.0, 1.0, 0.24);
  blade.rotation.y = Math.PI * 0.25;
  blade.position.y = 0.08 + bladeLen * 0.5;
  swordMesh.add(blade);

  const lowerBlade = new THREE.Mesh(
    new THREE.BoxGeometry(0.046, bladeLen * 0.65, 0.011),
    mats.polishedBlade
  );
  lowerBlade.position.y = 0.08 + bladeLen * 0.325;
  swordMesh.add(lowerBlade);

  const fuller = new THREE.Mesh(
    new THREE.BoxGeometry(0.013, bladeLen * 0.68, 0.0135),
    mats.darkIron
  );
  fuller.position.y = 0.08 + bladeLen * 0.34;
  swordMesh.add(fuller);

  mergeStaticMeshesByMaterial(swordMesh, { castShadow: true, receiveShadow: true });
  swordMesh.userData.noMerge = true;

  return swordMesh;
}

/**
 * Builds the 3.6m Couched Cavalry War Lance with conical steel vamplate hand-guard,
 * spiral crimson/gold tournament bands, ribbed steel spearhead, and wind-animated pennon.
 */
function buildCavalryLance(mats, isCompanion) {
  const lanceGroup = new THREE.Group();
  lanceGroup.name = 'lanceGroup';

  const rearShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.034, 0.75, 12),
    mats.woodOak
  );
  rearShaft.rotation.x = Math.PI * 0.5;
  rearShaft.position.z = -0.375;
  lanceGroup.add(rearShaft);

  const buttCap = new THREE.Mesh(
    new THREE.ConeGeometry(0.034, 0.12, 12),
    mats.darkIron
  );
  buttCap.rotation.x = -Math.PI * 0.5;
  buttCap.position.z = -0.81;
  lanceGroup.add(buttCap);

  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.22, 10),
    mats.leatherDark
  );
  grip.rotation.x = Math.PI * 0.5;
  grip.position.z = 0.08;
  lanceGroup.add(grip);

  const vamplate = new THREE.Mesh(
    new THREE.ConeGeometry(0.115, 0.16, 18, 1, true),
    mats.steelPlate
  );
  vamplate.rotation.x = Math.PI * 0.5;
  vamplate.position.z = 0.24;
  lanceGroup.add(vamplate);

  const vamplateRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.115, 0.008, 8, 18),
    mats.gildedBrass
  );
  vamplateRim.position.z = 0.16;
  lanceGroup.add(vamplateRim);

  const frontShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.036, 2.3, 14),
    mats.woodOak
  );
  frontShaft.rotation.x = Math.PI * 0.5;
  frontShaft.position.z = 1.42;
  lanceGroup.add(frontShaft);

  for (let i = 0; i < 6; i++) {
    const bandZ = 0.48 + i * 0.34;
    const r = 0.034 - i * 0.003;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.96, r * 1.02, 0.14, 12),
      i % 2 === 0 ? mats.capeCrimson : mats.gildedBrass
    );
    band.rotation.x = Math.PI * 0.5;
    band.position.z = bandZ;
    lanceGroup.add(band);
  }

  const socket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.016, 0.12, 10),
    mats.steelPlate
  );
  socket.rotation.x = Math.PI * 0.5;
  socket.position.z = 2.6;
  lanceGroup.add(socket);

  const spearBlade = new THREE.Mesh(
    new THREE.ConeGeometry(0.036, 0.34, 4),
    mats.polishedBlade
  );
  spearBlade.scale.set(0.45, 1, 1.1);
  spearBlade.rotation.x = Math.PI * 0.5;
  spearBlade.position.z = 2.82;
  lanceGroup.add(spearBlade);

  const pennonGeo = new THREE.PlaneGeometry(0.58, 0.22, 10, 4);
  const pPos = pennonGeo.attributes.position;
  const pUv = pennonGeo.attributes.uv;
  for (let i = 0; i < pPos.count; i++) {
    const u = pUv.getX(i);
    const v = pUv.getY(i);
    const yScale = 1.0 - u * 0.82;
    pPos.setY(i, (v - 0.5) * 0.22 * yScale);
    pPos.setX(i, u * 0.58);
  }
  pennonGeo.computeVertexNormals();

  const pennonMesh = new THREE.Mesh(
    pennonGeo,
    isCompanion ? mats.companionSurcoat : mats.crusaderSurcoat
  );
  pennonMesh.position.set(0, -0.02, 2.48);
  pennonMesh.rotation.y = -Math.PI * 0.5;
  lanceGroup.add(pennonMesh);
  registerWindCloth(pennonMesh, 'left', 0.055, 6.5);

  mergeStaticMeshesByMaterial(lanceGroup, { castShadow: true, receiveShadow: true });
  lanceGroup.userData.noMerge = true;

  return lanceGroup;
}

/**
 * Creates an articulated, multi-part 12th/13th-century Crusader Knight or Royal Companion.
 * Faces +Z forward, with y = 0 at ground level when standing on foot.
 */
export function createCrusaderKnight(options = {}) {
  const {
    isPlayer = false,
    isCompanion = false,
    variant = isCompanion ? 'companion' : 'crusader',
    mounted = true,
  } = options;

  const mats = getMaterials();
  const surcoatMat =
    variant === 'companion' || isCompanion
      ? mats.companionSurcoat
      : variant === 'hospitaller'
      ? mats.hospitallerSurcoat
      : mats.crusaderSurcoat;

  const shieldMat =
    variant === 'companion' || isCompanion ? mats.companionShield : mats.crusaderShield;

  const capeMat =
    variant === 'companion' || isCompanion ? mats.capeCompanionGold : mats.capeCrimson;

  const root = new THREE.Group();
  root.name = isPlayer ? 'PlayerCrusaderKnight' : isCompanion ? 'CompanionKnight' : 'CrusaderKnight';

  // Pelvis / Hips root pivot (y = 0.92 when standing on foot so sabatons rest at y = 0)
  const pelvisGroup = new THREE.Group();
  pelvisGroup.name = 'pelvisGroup';
  pelvisGroup.position.set(0, 0.92, 0);
  root.add(pelvisGroup);

  // ── 1. PELVIS, CHAINMAIL HAUBERK SKIRT & CONTOURED SPLIT SURCOAT SKIRT SHELLS ──
  const pelvisCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.162, 0.175, 0.18, 16),
    mats.chainmail
  );
  pelvisCore.scale.set(1.04, 1, 0.8);
  pelvisGroup.add(pelvisCore);

  // Scalloped Chainmail Hauberk Skirt peeking 5cm below the curved surcoat skirt shells
  const mailSkirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.168, 0.205, 0.34, 20, 1, true),
    mats.chainmail
  );
  mailSkirt.scale.set(1.04, 1, 0.8);
  mailSkirt.position.y = -0.17;
  pelvisGroup.add(mailSkirt);

  // Contoured Front & Rear Split Surcoat Skirt Shells (wrapping outside mailSkirt!)
  const skirtFlaps = [];
  const frontSkirtGeo = createCurvedTabardShellGeometry(
    0.184,
    0.236,
    0.29,
    -Math.PI * 0.44,
    Math.PI * 0.88,
    0.06,
    0.94
  );
  const frontSkirtFlap = new THREE.Mesh(frontSkirtGeo, surcoatMat);
  frontSkirtFlap.scale.set(1.07, 1, 0.84);
  frontSkirtFlap.position.set(0, -0.145, 0.008);
  frontSkirtFlap.userData.noMerge = true;
  pelvisGroup.add(frontSkirtFlap);
  skirtFlaps.push(frontSkirtFlap);

  const rearSkirtGeo = createCurvedTabardShellGeometry(
    0.184,
    0.236,
    0.29,
    Math.PI * 0.56,
    Math.PI * 0.88,
    0.06,
    0.94
  );
  const rearSkirtFlap = new THREE.Mesh(rearSkirtGeo, surcoatMat);
  rearSkirtFlap.scale.set(1.07, 1, 0.84);
  rearSkirtFlap.position.set(0, -0.145, -0.008);
  rearSkirtFlap.userData.noMerge = true;
  pelvisGroup.add(rearSkirtFlap);
  skirtFlaps.push(rearSkirtFlap);

  // ── 2. LAYERED TORSO GROUP ──
  const torsoGroup = new THREE.Group();
  torsoGroup.name = 'torsoGroup';
  torsoGroup.position.set(0, 0.06, 0);
  pelvisGroup.add(torsoGroup);

  // Inner Chainmail Hauberk Chest (visible at underarms and sides)
  const mailChest = new THREE.Mesh(
    new THREE.CylinderGeometry(0.212, 0.168, 0.45, 18),
    mats.chainmail
  );
  mailChest.scale.set(1.06, 1, 0.78);
  mailChest.position.y = 0.225;
  torsoGroup.add(mailChest);

  // Side & Shoulder Surcoat Cloth Body underneath the front heraldic shell
  const surcoatSides = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.178, 0.45, 20),
    surcoatMat
  );
  surcoatSides.scale.set(1.07, 1, 0.79);
  surcoatSides.position.y = 0.225;
  torsoGroup.add(surcoatSides);

  // Curved Cylindrical Front Tabard Shell (100% centered Crusader/Jerusalem Cross on +Z chest!)
  const frontTabardGeo = createCurvedTabardShellGeometry(
    0.228,
    0.185,
    0.452,
    -Math.PI * 0.34,
    Math.PI * 0.68,
    0.08,
    0.92
  );
  const frontTabard = new THREE.Mesh(frontTabardGeo, surcoatMat);
  frontTabard.scale.set(1.08, 1, 0.82);
  frontTabard.position.set(0, 0.225, 0.004);
  torsoGroup.add(frontTabard);

  // Steel Gorget Collar Plate at upper chest / base of neck
  const gorget = new THREE.Mesh(
    new THREE.CylinderGeometry(0.135, 0.195, 0.065, 18),
    mats.steelPlate
  );
  gorget.scale.set(1.05, 1, 0.85);
  gorget.position.y = 0.455;
  torsoGroup.add(gorget);

  // Contoured Diagonal Leather Baldric Strap hugging the exact elliptical chest from right shoulder to left hip
  const baldricPoints = [];
  const numBaldricPts = 24;
  for (let i = 0; i < numBaldricPts; i++) {
    const theta = (i / numBaldricPts) * Math.PI * 2;
    const y = 0.23 - 0.19 * Math.sin(theta);
    const rBase = 0.184 + ((y - 0.02) / 0.44) * 0.044;
    const x = Math.sin(theta) * rBase * 1.09;
    const z = Math.cos(theta) * rBase * 0.835;
    baldricPoints.push(new THREE.Vector3(x, y, z));
  }
  const baldricCurve = new THREE.CatmullRomCurve3(baldricPoints, true);
  const baldric = new THREE.Mesh(
    new THREE.TubeGeometry(baldricCurve, 28, 0.013, 6, true),
    mats.leatherDark
  );
  torsoGroup.add(baldric);

  // Brass Baldric Clasp Ring on chest
  const baldricRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.022, 0.005, 6, 12),
    mats.gildedBrass
  );
  baldricRing.position.set(-0.07, 0.3, 0.165);
  baldricRing.rotation.y = -0.3;
  torsoGroup.add(baldricRing);

  // Heavy Knightly Sword Belt around waist with Gilded Brass Buckle & Strap-End
  const waistBelt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.188, 0.192, 0.048, 20),
    mats.leatherDark
  );
  waistBelt.scale.set(1.09, 1, 0.85);
  waistBelt.position.y = 0.02;
  torsoGroup.add(waistBelt);

  const beltBuckle = new THREE.Mesh(
    new THREE.BoxGeometry(0.056, 0.058, 0.022),
    mats.gildedBrass
  );
  beltBuckle.position.set(0, 0.02, 0.166);
  torsoGroup.add(beltBuckle);

  const beltTongue = new THREE.Mesh(
    new THREE.BoxGeometry(0.028, 0.19, 0.012),
    mats.leatherDark
  );
  beltTongue.position.set(0.025, -0.075, 0.172);
  beltTongue.rotation.z = 0.08;
  torsoGroup.add(beltTongue);

  const beltTipChape = new THREE.Mesh(
    new THREE.ConeGeometry(0.016, 0.035, 4),
    mats.gildedBrass
  );
  beltTipChape.rotation.z = Math.PI;
  beltTipChape.position.set(0.032, -0.175, 0.172);
  torsoGroup.add(beltTipChape);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const stud = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.024, 0.018),
      mats.gildedBrass
    );
    stud.position.set(Math.sin(a) * 0.204, 0.02, Math.cos(a) * 0.162);
    stud.rotation.y = a;
    torsoGroup.add(stud);
  }

  // Detailed Leather-and-Brass Scabbard angled at the Left Hip (+X side)
  const scabbardGroup = new THREE.Group();
  scabbardGroup.position.set(0.215, -0.04, -0.02);
  scabbardGroup.rotation.x = -0.58;
  scabbardGroup.rotation.z = 0.18;
  torsoGroup.add(scabbardGroup);

  const scabbardBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.022, 0.78, 0.052),
    mats.leatherDark
  );
  scabbardBody.position.y = -0.32;
  scabbardGroup.add(scabbardBody);

  for (const sy of [0.05, -0.14, -0.35]) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, 0.036, 0.058),
      mats.gildedBrass
    );
    band.position.y = sy;
    scabbardGroup.add(band);
  }
  const scabbardChape = new THREE.Mesh(
    new THREE.ConeGeometry(0.028, 0.12, 4),
    mats.gildedBrass
  );
  scabbardChape.rotation.z = Math.PI;
  scabbardChape.scale.set(0.55, 1, 1.1);
  scabbardChape.position.y = -0.75;
  scabbardGroup.add(scabbardChape);

  // ── 3. DYNAMIC FLOWING CAPE (Pinned at top edge y = 0, draping cleanly behind back -Z) ──
  const capeGeo = new THREE.PlaneGeometry(0.68, 1.05, 8, 12);
  // Translate geometry downward by half-height so the top pinned edge is at local y = 0
  // and all cape vertices have y <= 0, preventing the upper cape from ever tilting into the back!
  capeGeo.translate(0, -0.525, 0);
  const capeMesh = new THREE.Mesh(capeGeo, capeMat);
  capeMesh.position.set(0, 0.44, -0.195);
  // Positive X rotation moves negative-Y vertices toward -Z (further behind the back!)
  capeMesh.rotation.x = 0.16;
  torsoGroup.add(capeMesh);
  const capeEntry = registerWindCloth(capeMesh, 'top', 0.09, 4.5);

  // Ornate Golden Shoulder Cape Clasps (Fermails) on Left & Right Shoulders
  for (const side of [-1, 1]) {
    const clasp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.04, 0.018, 12),
      mats.gildedBrass
    );
    clasp.rotation.x = Math.PI * 0.42;
    clasp.position.set(side * 0.175, 0.43, 0.135);
    torsoGroup.add(clasp);

    const claspBoss = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 8, 8),
      mats.capeCrimson
    );
    claspBoss.position.set(side * 0.175, 0.435, 0.145);
    torsoGroup.add(claspBoss);
  }

  // ── 4. SCULPTED GREAT HELM (headGroup) ──
  const headGroup = buildGreatHelm(mats, { isPlayer, isCompanion, variant });
  headGroup.position.set(0, 0.46, 0);
  torsoGroup.add(headGroup);

  // ── 5. MULTI-JOINTED ARTICULATED ARMS ──
  function buildPauldron(side) {
    const pGroup = new THREE.Group();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.098, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
      mats.steelPlate
    );
    dome.scale.set(1.15, 0.95, 1.12);
    dome.position.set(side * 0.015, 0.015, 0);
    dome.rotation.z = -side * 0.35;
    pGroup.add(dome);

    for (let l = 1; l <= 2; l++) {
      const lame = new THREE.Mesh(
        new THREE.CylinderGeometry(0.088, 0.094, 0.042, 14, 1, true, -Math.PI * 0.4, Math.PI * 0.8),
        mats.steelPlate
      );
      lame.rotation.y = side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      lame.position.set(side * 0.012, -0.025 * l, 0);
      pGroup.add(lame);
    }

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.092, 0.007, 6, 16),
      mats.gildedBrass
    );
    rim.rotation.x = Math.PI * 0.5;
    rim.rotation.y = -side * 0.35;
    rim.position.set(side * 0.015, -0.01, 0);
    pGroup.add(rim);

    const besagew = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.048, 0.012, 12),
      isCompanion || isPlayer ? mats.gildedBrass : mats.steelPlate
    );
    besagew.rotation.x = Math.PI * 0.5;
    besagew.position.set(-side * 0.03, -0.02, 0.09);
    pGroup.add(besagew);

    return pGroup;
  }

  // LEFT ARM (+X side): Shoulder -> Forearm -> Heater Shield
  const leftArmGroup = new THREE.Group();
  leftArmGroup.name = 'leftArmGroup';
  leftArmGroup.position.set(0.27, 0.41, 0);
  torsoGroup.add(leftArmGroup);

  leftArmGroup.add(buildPauldron(1));

  const leftUpperArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.068, 0.058, 0.27, 12),
    mats.chainmail
  );
  leftUpperArm.position.y = -0.135;
  leftArmGroup.add(leftUpperArm);

  const leftRerebrace = new THREE.Mesh(
    new THREE.CylinderGeometry(0.072, 0.062, 0.16, 12, 1, true, 0, Math.PI * 1.2),
    mats.steelPlate
  );
  leftRerebrace.position.y = -0.14;
  leftArmGroup.add(leftRerebrace);

  const leftForearmGroup = new THREE.Group();
  leftForearmGroup.name = 'leftForearmGroup';
  leftForearmGroup.position.set(0, -0.27, 0);
  leftArmGroup.add(leftForearmGroup);

  const leftCouter = new THREE.Mesh(
    new THREE.SphereGeometry(0.064, 12, 10),
    mats.steelPlate
  );
  leftCouter.scale.set(1.05, 0.85, 1.1);
  leftForearmGroup.add(leftCouter);

  const leftCouterWing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12),
    mats.gildedBrass
  );
  leftCouterWing.rotation.z = Math.PI * 0.5;
  leftCouterWing.position.set(0.062, 0, -0.01);
  leftForearmGroup.add(leftCouterWing);

  const leftVambrace = new THREE.Mesh(
    new THREE.CylinderGeometry(0.058, 0.046, 0.24, 12),
    mats.steelPlate
  );
  leftVambrace.position.y = -0.12;
  leftForearmGroup.add(leftVambrace);

  const leftGauntlet = new THREE.Mesh(
    new THREE.BoxGeometry(0.068, 0.095, 0.075),
    mats.steelPlate
  );
  leftGauntlet.position.set(0, -0.26, 0.01);
  leftForearmGroup.add(leftGauntlet);

  const shieldMesh = new THREE.Group();
  shieldMesh.name = 'shieldMesh';
  shieldMesh.position.set(0.095, -0.14, 0.065);
  shieldMesh.rotation.order = 'YXZ';
  shieldMesh.rotation.set(0.88, 0.42, -0.18);
  leftForearmGroup.add(shieldMesh);

  const heaterGeo = createCurvedHeaterShieldGeometry(0.54, 0.76, 0.095);
  const shieldFront = new THREE.Mesh(heaterGeo, shieldMat);
  shieldMesh.add(shieldFront);

  const heaterBackGeo = createCurvedHeaterShieldGeometry(0.52, 0.74, -0.09);
  const shieldBack = new THREE.Mesh(heaterBackGeo, mats.leatherDark);
  shieldBack.rotation.y = Math.PI;
  shieldBack.position.z = -0.008;
  shieldMesh.add(shieldBack);

  for (const strapY of [0.08, -0.12]) {
    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.035, 0.045),
      mats.leatherSaddle
    );
    strap.position.set(0, strapY, -0.025);
    shieldMesh.add(strap);
  }

  mergeStaticMeshesByMaterial(shieldMesh, { castShadow: true, receiveShadow: true });
  shieldMesh.userData.noMerge = true;

  mergeStaticMeshesByMaterial(leftForearmGroup, { castShadow: true, receiveShadow: true });
  leftForearmGroup.userData.noMerge = true;

  mergeStaticMeshesByMaterial(leftArmGroup, { castShadow: true, receiveShadow: true });
  leftArmGroup.userData.noMerge = true;

  // RIGHT ARM (-X side): Shoulder -> Forearm -> Hand -> Broadsword & Lance
  const rightArmGroup = new THREE.Group();
  rightArmGroup.name = 'rightArmGroup';
  rightArmGroup.position.set(-0.27, 0.41, 0);
  torsoGroup.add(rightArmGroup);

  rightArmGroup.add(buildPauldron(-1));

  const rightUpperArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.068, 0.058, 0.27, 12),
    mats.chainmail
  );
  rightUpperArm.position.y = -0.135;
  rightArmGroup.add(rightUpperArm);

  const rightRerebrace = new THREE.Mesh(
    new THREE.CylinderGeometry(0.072, 0.062, 0.16, 12, 1, true, -Math.PI * 0.2, Math.PI * 1.2),
    mats.steelPlate
  );
  rightRerebrace.position.y = -0.14;
  rightArmGroup.add(rightRerebrace);

  const rightForearmGroup = new THREE.Group();
  rightForearmGroup.name = 'rightForearmGroup';
  rightForearmGroup.position.set(0, -0.27, 0);
  rightArmGroup.add(rightForearmGroup);

  const rightCouter = new THREE.Mesh(
    new THREE.SphereGeometry(0.064, 12, 10),
    mats.steelPlate
  );
  rightCouter.scale.set(1.05, 0.85, 1.1);
  rightForearmGroup.add(rightCouter);

  const rightCouterWing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12),
    mats.gildedBrass
  );
  rightCouterWing.rotation.z = Math.PI * 0.5;
  rightCouterWing.position.set(-0.062, 0, -0.01);
  rightForearmGroup.add(rightCouterWing);

  const rightVambrace = new THREE.Mesh(
    new THREE.CylinderGeometry(0.058, 0.046, 0.24, 12),
    mats.steelPlate
  );
  rightVambrace.position.y = -0.12;
  rightForearmGroup.add(rightVambrace);

  const rightHandGroup = new THREE.Group();
  rightHandGroup.name = 'rightHandGroup';
  rightHandGroup.position.set(0, -0.25, 0);
  rightForearmGroup.add(rightHandGroup);

  const gauntletCuff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.052, 0.046, 0.065, 10),
    mats.steelPlate
  );
  gauntletCuff.position.y = 0.02;
  rightHandGroup.add(gauntletCuff);

  const rightGauntletPalm = new THREE.Mesh(
    new THREE.BoxGeometry(0.068, 0.082, 0.075),
    mats.steelPlate
  );
  rightGauntletPalm.position.set(0, -0.025, 0.012);
  rightHandGroup.add(rightGauntletPalm);

  const swordMesh = buildCruciformSword(mats);
  swordMesh.position.set(0, -0.03, 0.03);
  swordMesh.rotation.x = Math.PI * 0.42;
  rightHandGroup.add(swordMesh);

  const lanceGroup = buildCavalryLance(mats, isCompanion);
  lanceGroup.position.set(0, -0.03, 0.05);
  lanceGroup.visible = Boolean(mounted);
  rightHandGroup.add(lanceGroup);

  mergeStaticMeshesByMaterial(rightHandGroup, { castShadow: true, receiveShadow: true });
  rightHandGroup.userData.noMerge = true;

  mergeStaticMeshesByMaterial(rightForearmGroup, { castShadow: true, receiveShadow: true });
  rightForearmGroup.userData.noMerge = true;

  mergeStaticMeshesByMaterial(rightArmGroup, { castShadow: true, receiveShadow: true });
  rightArmGroup.userData.noMerge = true;

  mergeStaticMeshesByMaterial(torsoGroup, { castShadow: true, receiveShadow: true });
  torsoGroup.userData.noMerge = true;

  // ── 6. MULTI-JOINTED ARTICULATED LEGS ──
  function buildKnightLeg(side) {
    const legGroup = new THREE.Group();
    legGroup.name = side > 0 ? 'leftLegGroup' : 'rightLegGroup';
    legGroup.position.set(side * 0.115, -0.02, 0);

    const thighMail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088, 0.072, 0.42, 14),
      mats.chainmail
    );
    thighMail.position.y = -0.21;
    legGroup.add(thighMail);

    const cuissePlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.091, 0.076, 0.28, 12, 1, true, -Math.PI * 0.38, Math.PI * 0.76),
      mats.steelPlate
    );
    cuissePlate.position.set(0, -0.23, 0.005);
    legGroup.add(cuissePlate);

    for (const strapY of [-0.12, -0.29]) {
      const strap = new THREE.Mesh(
        new THREE.TorusGeometry(0.084, 0.008, 6, 14),
        mats.leatherDark
      );
      strap.rotation.x = Math.PI * 0.5;
      strap.position.y = strapY;
      legGroup.add(strap);
    }

    const shinGroup = new THREE.Group();
    shinGroup.name = side > 0 ? 'leftShinGroup' : 'rightShinGroup';
    shinGroup.position.set(0, -0.43, 0);
    legGroup.add(shinGroup);

    const poleyn = new THREE.Mesh(
      new THREE.SphereGeometry(0.076, 12, 10),
      mats.steelPlate
    );
    poleyn.scale.set(0.95, 0.92, 1.15);
    poleyn.position.z = 0.015;
    shinGroup.add(poleyn);

    const poleynRidge = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.095, 0.03),
      mats.gildedBrass
    );
    poleynRidge.position.set(0, 0, 0.082);
    shinGroup.add(poleynRidge);

    const poleynWing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.048, 0.012, 12),
      mats.steelPlate
    );
    poleynWing.rotation.z = Math.PI * 0.5;
    poleynWing.position.set(side * 0.072, 0, -0.01);
    shinGroup.add(poleynWing);

    const shinGreave = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.052, 0.39, 14),
      mats.steelPlate
    );
    shinGreave.position.y = -0.2;
    shinGroup.add(shinGreave);

    const sabatonGroup = new THREE.Group();
    sabatonGroup.position.set(0, -0.42, 0.04);
    shinGroup.add(sabatonGroup);

    for (let s = 0; s < 4; s++) {
      const lame = new THREE.Mesh(
        new THREE.BoxGeometry(0.092 - s * 0.008, 0.055 - s * 0.005, 0.052),
        mats.steelPlate
      );
      lame.position.set(0, -0.015, -0.03 + s * 0.038);
      lame.rotation.x = 0.12 * s;
      sabatonGroup.add(lame);
    }

    const toeCap = new THREE.Mesh(
      new THREE.ConeGeometry(0.042, 0.075, 8),
      mats.steelPlate
    );
    toeCap.rotation.x = Math.PI * 0.5;
    toeCap.scale.set(1.1, 1, 0.72);
    toeCap.position.set(0, -0.022, 0.12);
    sabatonGroup.add(toeCap);

    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.094, 0.016, 0.22),
      mats.leatherDark
    );
    sole.position.set(0, -0.042, 0.02);
    sabatonGroup.add(sole);

    const spurYoke = new THREE.Mesh(
      new THREE.TorusGeometry(0.052, 0.006, 6, 12, Math.PI),
      mats.gildedBrass
    );
    spurYoke.rotation.x = Math.PI * 0.5;
    spurYoke.rotation.z = Math.PI;
    spurYoke.position.set(0, -0.02, -0.055);
    sabatonGroup.add(spurYoke);

    const spurShank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.048, 6),
      mats.gildedBrass
    );
    spurShank.rotation.x = Math.PI * 0.5;
    spurShank.position.set(0, -0.02, -0.125);
    sabatonGroup.add(spurShank);

    const spurRowel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.005, 8),
      mats.gildedBrass
    );
    spurRowel.rotation.z = Math.PI * 0.5;
    spurRowel.position.set(0, -0.02, -0.15);
    sabatonGroup.add(spurRowel);

    mergeStaticMeshesByMaterial(shinGroup, { castShadow: true, receiveShadow: true });
    shinGroup.userData.noMerge = true;

    mergeStaticMeshesByMaterial(legGroup, { castShadow: true, receiveShadow: true });
    legGroup.userData.noMerge = true;

    return { legGroup, shinGroup };
  }

  const { legGroup: leftLegGroup, shinGroup: leftShinGroup } = buildKnightLeg(1);
  const { legGroup: rightLegGroup, shinGroup: rightShinGroup } = buildKnightLeg(-1);
  pelvisGroup.add(leftLegGroup);
  pelvisGroup.add(rightLegGroup);

  mergeStaticMeshesByMaterial(pelvisGroup, { castShadow: true, receiveShadow: true });

  // ── 7. COMPANION TACTICAL INDICATOR ──
  const companionMarker = new THREE.Group();
  companionMarker.name = 'companionMarker';
  companionMarker.visible = Boolean(isCompanion);
  companionMarker.userData.noMerge = true;
  root.add(companionMarker);

  if (isCompanion) {
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffcf54,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    const groundRing = new THREE.Mesh(
      new THREE.RingGeometry(0.68, 0.78, 32),
      ringMat
    );
    groundRing.rotation.x = -Math.PI * 0.5;
    groundRing.position.y = 0.04;
    companionMarker.add(groundRing);

    const chevronMat = new THREE.MeshStandardMaterial({
      color: 0xffd866,
      emissive: 0xd48817,
      emissiveIntensity: 0.75,
      metalness: 0.9,
      roughness: 0.15,
    });
    const chevron = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.075, 0),
      chevronMat
    );
    chevron.scale.set(1.0, 1.45, 0.55);
    chevron.position.set(0, 2.15, 0);
    chevron.name = 'companionChevron';
    companionMarker.add(chevron);
  }

  enableShadows(root, true, true);

  // ── 8. MOUNTED VS FOOT POSE CONTROLLER ──
  let currentlyMounted = Boolean(mounted);

  function setMountedPose(isMounted) {
    currentlyMounted = Boolean(isMounted);
    if (currentlyMounted) {
      pelvisGroup.position.set(0, 0, 0);

      // Spread thighs/knees outward to straddle the warhorse saddle
      leftLegGroup.rotation.set(-0.38, 0.12, 0.42);
      rightLegGroup.rotation.set(-0.38, -0.12, -0.42);

      // Bend knees backward so sabatons rest cleanly in the iron stirrups
      leftShinGroup.rotation.set(0.55, 0, -0.12);
      rightShinGroup.rotation.set(0.55, 0, 0.12);

      // Flare contoured front/rear surcoat skirt shells slightly over saddle pommel/cantle
      skirtFlaps[0].rotation.x = -0.22;
      skirtFlaps[1].rotation.x = 0.22;

      leftArmGroup.rotation.set(-0.35, 0.15, 0.18);
      leftForearmGroup.rotation.set(-0.65, 0.25, 0);

      rightArmGroup.rotation.set(-0.25, -0.12, -0.22);
      rightForearmGroup.rotation.set(-0.55, 0, 0);

      lanceGroup.visible = true;
      lanceGroup.rotation.set(-0.95, 0, 0);
      swordMesh.visible = true;
    } else {
      pelvisGroup.position.set(0, 0.92, 0);

      leftLegGroup.rotation.set(0, 0, 0.03);
      rightLegGroup.rotation.set(0, 0, -0.03);
      leftShinGroup.rotation.set(0.05, 0, 0);
      rightShinGroup.rotation.set(0.05, 0, 0);

      skirtFlaps[0].rotation.x = -0.04;
      skirtFlaps[1].rotation.x = 0.04;

      leftArmGroup.rotation.set(-0.22, 0.1, 0.14);
      leftForearmGroup.rotation.set(-0.58, 0.2, 0);
      rightArmGroup.rotation.set(-0.18, -0.1, -0.16);
      rightForearmGroup.rotation.set(-0.48, 0, 0);

      lanceGroup.visible = false;
      swordMesh.visible = true;
    }
  }

  setMountedPose(currentlyMounted);

  // ── 9. REAL-TIME SKELETAL ANIMATION UPDATER ──
  let internalTime = Math.random() * 10;

  function updateAnimation(dt = 0.016, animState = {}) {
    internalTime += dt;
    const t = animState.time !== undefined ? animState.time : internalTime;
    const speed = animState.speed || 0;
    const isMounted = animState.isMounted !== undefined ? animState.isMounted : currentlyMounted;
    const attackProgress = animState.attackProgress || 0;
    const attackType = animState.attackType || 'slash';
    const shieldBlock = Boolean(animState.shieldBlock);
    const isLanceCouched = Boolean(
      animState.useLance ||
      animState.lanceCharge ||
      animState.isCharging ||
      attackType === 'lance'
    );
    const hitReact = animState.hitReact || 0;

    if (isMounted !== currentlyMounted) {
      setMountedPose(isMounted);
    }

    if (capeEntry) {
      capeEntry.extraSpeed = speed;
    }

    // Animate Companion tactical marker
    if (companionMarker.visible) {
      companionMarker.position.y = isMounted ? -1.42 : 0;
      const chevron = companionMarker.getObjectByName('companionChevron');
      if (chevron) {
        chevron.rotation.y = t * 2.2;
        chevron.position.y = (isMounted ? 3.55 : 2.15) + Math.sin(t * 3.5) * 0.06;
      }
    }

    const breath = Math.sin(t * 2.4) * 0.025;

    if (isMounted) {
      const gallopFreq = 7.5 + speed * 0.45;
      const strideFactor = Math.min(1, speed / 8);
      const bob = Math.sin(t * gallopFreq) * 0.035 * strideFactor;

      pelvisGroup.position.y = bob;
      torsoGroup.rotation.x = 0.08 * strideFactor + breath - hitReact * 0.35;
      torsoGroup.rotation.y = Math.cos(t * gallopFreq * 0.5) * 0.04 * strideFactor;

      headGroup.rotation.x = -0.05 * strideFactor + Math.sin(t * 1.8) * 0.03;
      headGroup.rotation.y = Math.sin(t * 1.1) * 0.08 * (1 - strideFactor * 0.5);

      leftLegGroup.rotation.set(-0.38 - bob * 1.2, 0.12, 0.42);
      rightLegGroup.rotation.set(-0.38 - bob * 1.2, -0.12, -0.42);
      leftShinGroup.rotation.set(0.55 + bob * 1.5, 0, -0.12);
      rightShinGroup.rotation.set(0.55 + bob * 1.5, 0, 0.12);
    } else {
      const moveFactor = Math.min(1, speed / 4.5);
      const walkFreq = 6.2 + speed * 0.65;
      const phase = t * walkFreq;

      if (moveFactor > 0.05) {
        const legSwing = Math.sin(phase) * 0.62 * moveFactor;
        const rightSwing = Math.sin(phase + Math.PI) * 0.62 * moveFactor;

        pelvisGroup.position.y = 0.92 + Math.abs(Math.cos(phase)) * 0.045 * moveFactor - moveFactor * 0.03;
        torsoGroup.rotation.x = 0.12 * moveFactor + breath - hitReact * 0.35;
        torsoGroup.rotation.y = -Math.sin(phase) * 0.12 * moveFactor;

        leftLegGroup.rotation.set(legSwing, 0, 0.03);
        rightLegGroup.rotation.set(rightSwing, 0, -0.03);

        leftShinGroup.rotation.set(Math.max(0.05, -Math.cos(phase) * 0.65 * moveFactor), 0, 0);
        rightShinGroup.rotation.set(Math.max(0.05, -Math.cos(phase + Math.PI) * 0.65 * moveFactor), 0, 0);

        headGroup.rotation.x = -0.06 * moveFactor;
        headGroup.rotation.y = Math.sin(phase) * 0.06 * moveFactor;
      } else {
        pelvisGroup.position.y = 0.92 + breath * 0.3;
        torsoGroup.rotation.x = breath - hitReact * 0.35;
        torsoGroup.rotation.y = Math.sin(t * 1.2) * 0.05;
        headGroup.rotation.y = Math.sin(t * 0.85) * 0.12;
        headGroup.rotation.x = Math.cos(t * 1.4) * 0.03;

        leftLegGroup.rotation.set(-0.08, 0, 0.04);
        rightLegGroup.rotation.set(0.1, 0, -0.04);
        leftShinGroup.rotation.set(0.12, 0, 0);
        rightShinGroup.rotation.set(0.14, 0, 0);
      }
    }

    // ── SHIELD ARM (Left Arm) ──
    if (shieldBlock) {
      leftArmGroup.rotation.set(-0.85, -0.38, 0.12);
      leftForearmGroup.rotation.set(-1.05, 0.55, -0.2);
    } else {
      const armBob = Math.sin(t * (isMounted ? 7.5 : 5.5)) * 0.06 * Math.min(1, speed / 5);
      leftArmGroup.rotation.set(-0.36 + armBob, 0.18, 0.18);
      leftForearmGroup.rotation.set(-0.68, 0.28, 0);
    }

    // ── WEAPON ARM (Right Arm: Couched Lance / Upright Cavalry Lance / Sword Slash) ──
    if (isLanceCouched) {
      lanceGroup.visible = true;
      swordMesh.visible = false;
      const chargeBrace = Math.min(1, speed / 6);
      rightArmGroup.rotation.set(-0.22 - chargeBrace * 0.15, 0.08, -0.12);
      rightForearmGroup.rotation.set(-1.18, -0.1, 0);
      rightHandGroup.rotation.set(0.28, 0, 0);
      lanceGroup.rotation.set(-0.08 + (attackProgress > 0 ? -Math.sin(attackProgress * Math.PI) * 0.08 : 0), 0, 0);
      lanceGroup.position.z = 0.05 + Math.sin(attackProgress * Math.PI) * 0.42;
    } else if (attackProgress > 0) {
      // Active melee broadsword swing
      swordMesh.visible = true;
      if (isMounted) {
        lanceGroup.visible = false;
      }
      const p = attackProgress;
      const swing = Math.sin(p * Math.PI);
      if (attackType === 'cleave') {
        const windup = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65;
        const strike = p < 0.35 ? -windup * 0.8 : -0.8 + ((p - 0.35) / 0.65) * 2.2;
        rightArmGroup.rotation.set(-1.35 + strike * 0.95, -0.2 * swing, -0.15);
        rightForearmGroup.rotation.set(-0.85 + Math.max(0, strike) * 0.55, 0, 0);
        rightHandGroup.rotation.set(Math.max(0, strike) * 0.45, 0, 0);
        torsoGroup.rotation.x += strike * 0.18;
      } else if (attackType === 'thrust') {
        rightArmGroup.rotation.set(-0.95 * swing - 0.25, -0.15 * swing, -0.12);
        rightForearmGroup.rotation.set(-0.55 + 0.45 * swing, 0, 0);
        rightHandGroup.rotation.set(0.55 * swing, 0, 0);
        torsoGroup.rotation.y += 0.28 * swing;
      } else {
        const arc = Math.cos(p * Math.PI);
        rightArmGroup.rotation.set(-0.78 - 0.25 * swing, arc * 0.85, -0.35 - 0.25 * swing);
        rightForearmGroup.rotation.set(-0.45 - 0.25 * (1 - swing), 0, -0.3 * swing);
        rightHandGroup.rotation.set(0.35 * swing, 0, -0.25 * arc);
        torsoGroup.rotation.y += -arc * 0.24 * swing;
      }
    } else {
      // Ready combat guard: when mounted, display lance in upright cavalry carry pose!
      if (isMounted && animState.useLance !== false) {
        lanceGroup.visible = true;
        lanceGroup.rotation.set(-1.02, 0, 0);
        lanceGroup.position.z = 0.05;
        swordMesh.visible = false;
      } else {
        lanceGroup.visible = false;
        swordMesh.visible = true;
      }
      const walkSwing = !isMounted && speed > 0.2 ? Math.sin(t * (6.2 + speed * 0.65) + Math.PI) * 0.35 * Math.min(1, speed / 4.5) : 0;
      const rideBob = isMounted ? Math.cos(t * 7.5) * 0.08 * Math.min(1, speed / 8) : 0;
      rightArmGroup.rotation.set(-0.28 + walkSwing + rideBob, -0.14, -0.22);
      rightForearmGroup.rotation.set(-0.62 + breath * 2, 0, 0);
      rightHandGroup.rotation.set(0.1, 0, 0);
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
    swordMesh,
    lanceGroup,
    shieldMesh,
    capeEntry,
    companionMarker,
    setMountedPose,
    updateAnimation,
  };
}
