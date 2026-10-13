import * as THREE from '../vendor/three.module.js';
import { getTerrainHeight } from '../world/Battlefield.js';
import { getMaterials } from '../graphics/ProceduralTextures.js';
import { registerWindCloth } from '../graphics/PostProcessing.js';

/**
 * EffectsAndProjectiles.js
 * Object-pooled 3D arrows with air trails, metallic parry/hit sparks, hoof dust puffs,
 * armor/crimson hit debris, ground shockwave rings, 3D Tactical Command Standard marker,
 * dismounted Warhorse beacon, and 2D floating combat callouts.
 */
export class EffectsAndProjectiles {
  constructor(scene, soundManager) {
    this.scene = scene;
    this.sound = soundManager;
    this.root = new THREE.Group();
    this.root.name = 'EffectsAndProjectilesRoot';
    this.scene.add(this.root);

    this.arrows = [];
    this.particles = [];
    this.shockwaves = [];
    this.floatingLabels = [];
    this._tempVec = new THREE.Vector3();
    this._tempLook = new THREE.Vector3();

    this.labelsContainer = document.getElementById('floating-labels-container');

    this._initArrowPool(56);
    this._initParticlePool(180);
    this._initShockwavePool(12);
    this._initTacticalMarker();
    this._initHorseBeacon();
  }

  _initArrowPool(count) {
    const shaftGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.95, 6);
    shaftGeo.rotateX(Math.PI / 2);
    const tipGeo = new THREE.ConeGeometry(0.032, 0.14, 6);
    tipGeo.rotateX(Math.PI / 2);
    tipGeo.translate(0, 0, 0.52);
    const fletchGeo = new THREE.BoxGeometry(0.09, 0.015, 0.18);
    fletchGeo.translate(0, 0, -0.4);
    const trailGeo = new THREE.PlaneGeometry(0.045, 1.45);
    trailGeo.rotateX(Math.PI / 2);
    trailGeo.translate(0, 0, -0.65);

    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x7b5632, roughness: 0.7 });
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xd0dae5, metalness: 0.9, roughness: 0.2 });
    const fletchCrusaderMat = new THREE.MeshBasicMaterial({ color: 0xf5ecd7 });
    const fletchSaracenMat = new THREE.MeshBasicMaterial({ color: 0xd94426 });
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xfff1c9,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      const tip = new THREE.Mesh(tipGeo, tipMat);
      const fletch = new THREE.Mesh(fletchGeo, fletchCrusaderMat);
      const trail = new THREE.Mesh(trailGeo, trailMat);
      group.add(shaft, tip, fletch, trail);
      group.visible = false;
      this.root.add(group);

      this.arrows.push({
        group,
        fletch,
        trail,
        fletchCrusaderMat,
        fletchSaracenMat,
        active: false,
        stuck: false,
        life: 0,
        faction: 'saracen',
        damage: 16,
        position: group.position,
        velocity: new THREE.Vector3(),
      });
    }
  }

  _initParticlePool(count) {
    const sparkGeo = new THREE.OctahedronGeometry(0.065, 0);
    const dustGeo = new THREE.DodecahedronGeometry(0.24, 0);

    this.sparkMatGold = new THREE.MeshBasicMaterial({ color: 0xffdf72 });
    this.sparkMatOrange = new THREE.MeshBasicMaterial({ color: 0xff8a2b });
    this.bloodMat = new THREE.MeshStandardMaterial({ color: 0x9e1414, roughness: 0.5 });
    this.dustMat = new THREE.MeshStandardMaterial({
      color: 0xc8b08a,
      roughness: 0.95,
      transparent: true,
      opacity: 0.65,
    });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(sparkGeo, this.sparkMatGold);
      mesh.visible = false;
      this.root.add(mesh);
      this.particles.push({
        mesh,
        sparkGeo,
        dustGeo,
        active: false,
        age: 0,
        maxLife: 0.5,
        gravity: -9.8,
        scaleStart: 1,
        scaleEnd: 0.1,
        velocity: new THREE.Vector3(),
      });
    }
  }

  _initShockwavePool(count) {
    const ringGeo = new THREE.RingGeometry(0.65, 1.0, 28);
    ringGeo.rotateX(-Math.PI / 2);

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffcf5c,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      this.root.add(mesh);
      this.shockwaves.push({
        mesh,
        mat,
        active: false,
        age: 0,
        duration: 0.55,
        maxRadius: 4.5,
      });
    }
  }

  /**
   * Creates the 3D Tactical Order Standard & glowing double-ring marker planted when the player
   * redirects Companions (1: Follow, 2: Charge, 3: Shield Wall, 4: Hunt Archers).
   */
  _initTacticalMarker() {
    const mats = getMaterials();
    this.tacticalMarker = new THREE.Group();
    this.tacticalMarker.name = 'CompanionTacticalStandard';

    // Gilded pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.048, 3.6, 8),
      mats.gildedBrass
    );
    pole.position.y = 1.8;
    pole.castShadow = true;
    this.tacticalMarker.add(pole);

    // Finial cross
    const finialV = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.38, 0.08),
      mats.gildedBrass
    );
    finialV.position.y = 3.75;
    const finialH = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.08, 0.08),
      mats.gildedBrass
    );
    finialH.position.y = 3.75;
    this.tacticalMarker.add(finialV, finialH);

    // Heraldic Crusader Cross Banner with real-time wind cloth wave
    const bannerGeo = new THREE.PlaneGeometry(1.15, 0.68, 10, 4);
    bannerGeo.translate(0.58, 0, 0);
    const banner = new THREE.Mesh(bannerGeo, mats.crusaderSurcoat);
    banner.position.set(0.03, 3.18, 0);
    banner.castShadow = true;
    this.tacticalMarker.add(banner);
    registerWindCloth(banner, 'left', 0.11, 5.0);

    // Outer & inner ground-hugging tactical rings
    const ringGeo = new THREE.RingGeometry(1.55, 1.85, 36);
    ringGeo.rotateX(-Math.PI / 2);
    this.markerRingMat = new THREE.MeshBasicMaterial({
      color: 0xffd25a,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.markerRing = new THREE.Mesh(ringGeo, this.markerRingMat);
    this.markerRing.position.y = 0.10;
    this.tacticalMarker.add(this.markerRing);

    const innerRingGeo = new THREE.RingGeometry(0.85, 1.02, 28);
    innerRingGeo.rotateX(-Math.PI / 2);
    const innerRing = new THREE.Mesh(innerRingGeo, this.markerRingMat);
    innerRing.position.y = 0.11;
    this.tacticalMarker.add(innerRing);

    // Slender, subtle tapered light beam
    const pillarGeo = new THREE.CylinderGeometry(0.08, 0.9, 3.4, 16, 1, true);
    this.markerPillarMat = new THREE.MeshBasicMaterial({
      color: 0xffd25a,
      transparent: true,
      opacity: 0.11,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const pillar = new THREE.Mesh(pillarGeo, this.markerPillarMat);
    pillar.position.y = 1.7;
    this.tacticalMarker.add(pillar);

    this.tacticalMarker.visible = false;
    this.tacticalMarkerTimer = 0;
    this.root.add(this.tacticalMarker);
  }

  /**
   * Creates a subtle ground ring + small distant beacon above the player's Warhorse when dismounted.
   */
  _initHorseBeacon() {
    this.horseBeacon = new THREE.Group();
    this.horseBeaconDiamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.11, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd866 })
    );
    this.horseBeaconDiamond.scale.set(1, 1.35, 1);
    this.horseBeaconDiamond.position.y = 2.45;

    const ringGeo = new THREE.RingGeometry(0.95, 1.15, 28);
    ringGeo.rotateX(-Math.PI / 2);
    this.horseBeaconRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffd866,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.horseBeaconRing.position.y = 0.10;

    this.horseBeacon.add(this.horseBeaconDiamond, this.horseBeaconRing);
    this.horseBeacon.visible = false;
    this.root.add(this.horseBeacon);
  }

  /**
   * Places and activates the 3D Tactical Standard at `worldPos`.
   */
  setTacticalMarker(worldPos, orderType = 'charge') {
    const y = getTerrainHeight(worldPos.x, worldPos.z);
    this.tacticalMarker.position.set(worldPos.x, y, worldPos.z);
    this.tacticalMarker.visible = true;
    this.tacticalMarkerTimer = 9.0;

    let colorHex = 0xffcf54;
    if (orderType === 'charge') colorHex = 0xff482b;
    else if (orderType === 'hold') colorHex = 0x56b4ff;
    else if (orderType === 'archers') colorHex = 0x52f296;

    this.markerRingMat.color.setHex(colorHex);
    this.markerPillarMat.color.setHex(colorHex);
    this.spawnShockwave(this.tacticalMarker.position, 5.2, colorHex);
  }

  /**
   * Updates the Warhorse ground ring & distant overhead diamond when the player is on foot.
   * Only shows the overhead diamond when the player is > 5.5m away from the horse!
   */
  updateHorseBeacon(isMounted, horsePos, time, playerPos = null) {
    if (isMounted || !horsePos) {
      this.horseBeacon.visible = false;
      return;
    }
    this.horseBeacon.visible = true;
    this.horseBeacon.position.set(horsePos.x, horsePos.y, horsePos.z);

    const dist = playerPos ? Math.hypot(playerPos.x - horsePos.x, playerPos.z - horsePos.z) : 0;
    this.horseBeaconDiamond.visible = dist > 5.5;
    this.horseBeaconDiamond.position.y = 2.45 + Math.sin(time * 4.2) * 0.12;
    this.horseBeaconDiamond.rotation.y = time * 2.4;
  }

  /**
   * Clears all 2D floating combat labels immediately (used on state reset or inspection camera).
   */
  clearFloatingLabels() {
    for (let i = 0; i < this.floatingLabels.length; i++) {
      const item = this.floatingLabels[i];
      if (item.el && item.el.parentNode) {
        item.el.parentNode.removeChild(item.el);
      }
    }
    this.floatingLabels.length = 0;
  }

  /**
   * Spawns a pooled arrow or crossbow bolt.
   */
  spawnArrow(origin, velocity, faction = 'saracen', damage = 14) {
    let slot = null;
    for (let i = 0; i < this.arrows.length; i++) {
      if (!this.arrows[i].active) {
        slot = this.arrows[i];
        break;
      }
    }
    if (!slot) slot = this.arrows[0];

    slot.active = true;
    slot.stuck = false;
    slot.life = 0;
    slot.faction = faction;
    slot.damage = damage;
    slot.position.copy(origin);
    slot.velocity.copy(velocity);
    slot.fletch.material = faction === 'crusader' ? slot.fletchCrusaderMat : slot.fletchSaracenMat;
    slot.trail.visible = true;
    slot.group.visible = true;

    this._tempLook.copy(origin).add(velocity);
    slot.group.lookAt(this._tempLook);
  }

  /**
   * Spawns bright metallic sparks on sword clash, shield parry, or lance strike.
   */
  spawnSparks(pos, count = 10, isGold = true) {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.active) continue;
      p.active = true;
      p.age = 0;
      p.maxLife = 0.25 + Math.random() * 0.22;
      p.gravity = -14;
      p.scaleStart = 0.9 + Math.random() * 0.6;
      p.scaleEnd = 0.05;
      p.mesh.geometry = p.sparkGeo;
      p.mesh.material = isGold || Math.random() > 0.45 ? this.sparkMatGold : this.sparkMatOrange;
      p.mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.35,
        pos.y + (Math.random() - 0.5) * 0.35,
        pos.z + (Math.random() - 0.5) * 0.35
      );
      const speed = 3.5 + Math.random() * 6.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.65;
      p.velocity.set(
        Math.cos(theta) * Math.sin(phi) * speed,
        Math.cos(phi) * speed + 1.5,
        Math.sin(theta) * Math.sin(phi) * speed
      );
      p.mesh.visible = true;
      spawned++;
    }
  }

  /**
   * Spawns crimson/armor impact burst on damaging an enemy or ally.
   */
  spawnHitBurst(pos, count = 8) {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.active) continue;
      p.active = true;
      p.age = 0;
      p.maxLife = 0.32 + Math.random() * 0.2;
      p.gravity = -12;
      p.scaleStart = 1.1;
      p.scaleEnd = 0.1;
      p.mesh.geometry = p.sparkGeo;
      p.mesh.material = this.bloodMat;
      p.mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.3,
        pos.y + (Math.random() - 0.5) * 0.3,
        pos.z + (Math.random() - 0.5) * 0.3
      );
      p.velocity.set(
        (Math.random() - 0.5) * 5.0,
        1.8 + Math.random() * 3.2,
        (Math.random() - 0.5) * 5.0
      );
      p.mesh.visible = true;
      spawned++;
    }
  }

  /**
   * Spawns Levantine earth/sand dust puffs under galloping hooves or dodge-rolls.
   */
  spawnDust(pos, count = 3, scale = 1.0) {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.active) continue;
      p.active = true;
      p.age = 0;
      p.maxLife = 0.42 + Math.random() * 0.25;
      p.gravity = 0.6; // Slowly rises & dissipates
      p.scaleStart = 0.55 * scale;
      p.scaleEnd = 1.65 * scale;
      p.mesh.geometry = p.dustGeo;
      p.mesh.material = this.dustMat;
      p.mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.6,
        pos.y + 0.15 + Math.random() * 0.15,
        pos.z + (Math.random() - 0.5) * 0.6
      );
      p.velocity.set(
        (Math.random() - 0.5) * 1.4,
        0.5 + Math.random() * 0.8,
        (Math.random() - 0.5) * 1.4
      );
      p.mesh.visible = true;
      spawned++;
    }
  }

  /**
   * Spawns an expanding ground shockwave ring (Lance impact, Shield Bash, Tactical Order).
   */
  spawnShockwave(pos, maxRadius = 4.2, colorHex = 0xffcf5c) {
    for (let i = 0; i < this.shockwaves.length; i++) {
      const sw = this.shockwaves[i];
      if (!sw.active) {
        sw.active = true;
        sw.age = 0;
        sw.duration = 0.48;
        sw.maxRadius = maxRadius;
        sw.mat.color.setHex(colorHex);
        sw.mat.opacity = 0.85;
        const y = getTerrainHeight(pos.x, pos.z);
        sw.mesh.position.set(pos.x, y + 0.14, pos.z);
        sw.mesh.scale.setScalar(0.2);
        sw.mesh.visible = true;
        return;
      }
    }
  }

  /**
   * Spawns a 2D floating combat text callout projected from 3D world space.
   */
  spawnFloatingText(worldPos, text, type = 'normal') {
    if (this.inspectionHidden) return;
    if (!this.labelsContainer) {
      this.labelsContainer = document.getElementById('floating-labels-container');
    }
    if (!this.labelsContainer) return;

    // Limit active DOM labels to prevent clutter
    if (this.floatingLabels.length > 18) {
      const oldest = this.floatingLabels.shift();
      if (oldest && oldest.el && oldest.el.parentNode) {
        oldest.el.parentNode.removeChild(oldest.el);
      }
    }

    const el = document.createElement('div');
    el.className = `floating-combat-label label-${type}`;
    el.textContent = text;
    this.labelsContainer.appendChild(el);

    this.floatingLabels.push({
      el,
      worldPos: worldPos.clone(),
      age: 0,
      maxLife: type === 'lance' || type === 'objective' ? 1.35 : 0.95,
    });
  }

  /**
   * Updates all active arrows, particles, shockwaves, tactical marker, and 2D combat labels.
   */
  update(dt, time, camera, spatialGrid, player, battleAI) {
    // 1. Update Arrows
    for (let i = 0; i < this.arrows.length; i++) {
      const a = this.arrows[i];
      if (!a.active) continue;

      a.life += dt;
      if (a.stuck) {
        if (a.life > 3.2) {
          a.active = false;
          a.group.visible = false;
        }
        continue;
      }

      // Gravity and flight integration
      a.velocity.y -= 13.5 * dt;
      a.position.addScaledVector(a.velocity, dt);
      this._tempLook.copy(a.position).add(a.velocity);
      a.group.lookAt(this._tempLook);

      // Check terrain impact
      const groundY = getTerrainHeight(a.position.x, a.position.z);
      if (a.position.y <= groundY + 0.08) {
        a.position.y = groundY + 0.05;
        a.stuck = true;
        a.trail.visible = false;
        a.life = 0;
        continue;
      }

      // Check collision against Player if Saracen arrow
      if (a.faction === 'saracen' && player && !player.dead) {
        const pPos = player.position;
        const dx = a.position.x - pPos.x;
        const dz = a.position.z - pPos.z;
        const dy = a.position.y - (pPos.y + (player.isMounted ? 1.55 : 1.05));
        if (dx * dx + dz * dz < 0.78 && Math.abs(dy) < 1.15) {
          player.receiveDamage(a.damage, a.position, true);
          a.active = false;
          a.group.visible = false;
          continue;
        }
      }

      // Check collision against AI units via SpatialGrid
      if (spatialGrid) {
        const hitUnit = spatialGrid.findNearest(a.position.x, a.position.z, 0.95, (u) => {
          return u.faction && u.faction !== a.faction && !u.dead;
        });
        if (hitUnit) {
          const uY = hitUnit.position.y + (hitUnit.isMounted ? 1.45 : 1.0);
          if (Math.abs(a.position.y - uY) < 1.2) {
            if (battleAI) {
              battleAI.damageUnit(hitUnit, a.damage, null, false, true, 'ally');
            }
            a.active = false;
            a.group.visible = false;
            continue;
          }
        }
      }

      if (a.life > 5.0) {
        a.active = false;
        a.group.visible = false;
      }
    }

    // 2. Update Particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.maxLife) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      const t = p.age / p.maxLife;
      p.velocity.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      const s = p.scaleStart + (p.scaleEnd - p.scaleStart) * t;
      p.mesh.scale.setScalar(Math.max(0.01, s));
      p.mesh.rotation.x += dt * 5;
      p.mesh.rotation.y += dt * 4;
    }

    // 3. Update Shockwaves
    for (let i = 0; i < this.shockwaves.length; i++) {
      const sw = this.shockwaves[i];
      if (!sw.active) continue;
      sw.age += dt;
      if (sw.age >= sw.duration) {
        sw.active = false;
        sw.mesh.visible = false;
        continue;
      }
      const t = sw.age / sw.duration;
      const radius = 0.3 + (sw.maxRadius - 0.3) * (1 - Math.pow(1 - t, 2));
      sw.mesh.scale.setScalar(radius);
      sw.mat.opacity = (1 - t) * 0.85;
    }

    // 4. Update 3D Tactical Standard Marker
    if (this.tacticalMarker.visible) {
      this.tacticalMarkerTimer -= dt;
      const pulse = 1 + Math.sin(time * 6.5) * 0.10;
      this.markerRing.scale.setScalar(pulse);
      this.markerRingMat.opacity = Math.min(0.78, Math.max(0.2, this.tacticalMarkerTimer * 0.3));
      if (this.tacticalMarkerTimer <= 0) {
        this.tacticalMarker.visible = false;
      }
    }

    // 5. Update Floating 2D Combat Labels
    if (camera && this.floatingLabels.length > 0) {
      const halfW = window.innerWidth * 0.5;
      const halfH = window.innerHeight * 0.5;

      for (let i = this.floatingLabels.length - 1; i >= 0; i--) {
        const item = this.floatingLabels[i];
        item.age += dt;
        if (item.age >= item.maxLife) {
          if (item.el.parentNode) item.el.parentNode.removeChild(item.el);
          this.floatingLabels.splice(i, 1);
          continue;
        }
        item.worldPos.y += dt * 1.15;
        this._tempVec.copy(item.worldPos).project(camera);
        if (this._tempVec.z > 1) {
          item.el.style.display = 'none';
        } else {
          item.el.style.display = 'block';
          const sx = this._tempVec.x * halfW + halfW;
          const sy = -this._tempVec.y * halfH + halfH;
          const alpha = 1 - Math.pow(item.age / item.maxLife, 2);
          item.el.style.transform = `translate(-50%, -50%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
          item.el.style.opacity = alpha.toFixed(2);
        }
      }
    }
  }
}
