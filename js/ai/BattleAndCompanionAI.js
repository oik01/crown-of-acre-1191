import * as THREE from '../vendor/three.module.js';
import { createArmyUnit } from '../entities/ArmyUnits.js';
import { getTerrainHeight } from '../world/Battlefield.js';

/**
 * BattleAndCompanionAI.js
 * Manages:
 * - 6 Elite Companion Crusaders (3 Mounted Knights + 3 Heavy Foot Sergeants) with 4 instant tactical orders:
 *   1: 'follow' (V-Wedge around player, keeping center camera sightline clear)
 *   2: 'charge' (Surge into target zone with 3D Tactical Standard)
 *   3: 'hold'   (Interlocking Shield Wall line 8m ahead with central sightline gap)
 *   4: 'archers'(Flank & eliminate Saracen Composite Bowmen on the ridges)
 * - 22 Allied Crusader army units & 26 Enemy Saracen/Seljuk army units (Faris Cavalry, Spearmen, Bowmen, Emir Boss)
 * - 5 Chained Dynamic Battlefield Objectives & Army Morale Tug-of-War (0..100)
 */
export class BattleAndCompanionAI {
  constructor(scene, soundManager, effectsManager, spatialGrid, propsManager) {
    this.scene = scene;
    this.sound = soundManager;
    this.effects = effectsManager;
    this.spatialGrid = spatialGrid;
    this.props = propsManager;

    this.unitGroup = new THREE.Group();
    this.unitGroup.name = 'BattleUnitsRoot';
    this.scene.add(this.unitGroup);

    this.companions = [];
    this.allies = [];
    this.enemies = [];
    this.allUnits = [];

    // Companion Tactical Order State
    this.companionOrder = 'follow'; // 'follow' | 'charge' | 'hold' | 'archers'
    this.tacticalTarget = new THREE.Vector3(0, 0, -4);
    this.holdYaw = Math.PI;
    this.orderTimer = 0;

    // Army Morale (0..100, 54 start; 100 = Allied Victory, 0 = Rout)
    this.morale = 54;

    // 5 Chained Objectives
    this.objectiveIndex = 0;
    this.vanguardKills = 0;
    this.archerKills = 0;
    this.hilltopCapture = 0;
    this.ramEscortProgress = 0;
    this.emirBoss = null;
    this.victoryTriggered = false;

    // Callbacks for UI
    this.onObjectiveUpdate = null;
    this.onOrderChanged = null;
    this.onBattleVictory = null;

    this._nextUnitId = 1;
    this._spawnInitialArmies();
  }

  _spawnInitialArmies() {
    // ── 1. SPAWN 6 ELITE COMPANION CRUSADERS (3 Mounted Knights + 3 Foot Knights/Sergeants) ──
    // All offsets have |offsetX| >= 2.8 so no companion ever blocks the third-person camera sightline!
    const companionConfigs = [
      { role: 'companion', isMounted: true, offsetX: -3.4, offsetZ: 1.8 },
      { role: 'companion', isMounted: true, offsetX: 3.4, offsetZ: 1.8 },
      { role: 'companion', isMounted: true, offsetX: -5.8, offsetZ: 3.4 },
      { role: 'companion', isMounted: false, offsetX: 5.8, offsetZ: 3.4 },
      { role: 'companion', isMounted: false, offsetX: -2.8, offsetZ: -1.6 },
      { role: 'companion', isMounted: false, offsetX: 2.8, offsetZ: -1.6 },
    ];

    for (let i = 0; i < companionConfigs.length; i++) {
      const cfg = companionConfigs[i];
      const x = cfg.offsetX;
      const z = 22 + cfg.offsetZ;
      const unit = this._createUnitWrapper({
        faction: 'crusader',
        role: cfg.role,
        isCompanion: true,
        isMounted: cfg.isMounted,
        x,
        z,
        yaw: Math.PI,
        maxHealth: cfg.isMounted ? 185 : 155,
        damage: cfg.isMounted ? 34 : 28,
        companionIndex: i,
        wedgeOffset: new THREE.Vector3(cfg.offsetX, 0, cfg.offsetZ),
      });
      this.companions.push(unit);
      this.allies.push(unit);
      this.allUnits.push(unit);
    }

    // ── 2. SPAWN 16 ADDITIONAL ALLIED CRUSADER ARMY UNITS (Total 22 Allies + Player = 23) ──
    for (let i = 0; i < 16; i++) {
      let role = 'infantry';
      let isMounted = false;
      let x = ((i % 6) - 2.5) * 4.8 + (Math.random() - 0.5) * 1.5;
      let z = 14 + Math.floor(i / 6) * 5.5;

      if (i < 4) {
        role = 'cavalry';
        isMounted = true;
        x = (i - 1.5) * 6.5;
        z = 16 + (i % 2) * 3.0;
      } else if (i >= 11) {
        role = 'archer';
        isMounted = false;
        x = (i - 13) * 7.5;
        z = 28 + (i % 2) * 2.5;
      }

      const unit = this._createUnitWrapper({
        faction: 'crusader',
        role,
        isCompanion: false,
        isMounted,
        x,
        z,
        yaw: Math.PI,
        maxHealth: isMounted ? 130 : role === 'archer' ? 85 : 105,
        damage: isMounted ? 24 : 18,
      });
      this.allies.push(unit);
      this.allUnits.push(unit);
    }

    // ── 3. SPAWN 26 ENEMY SARACEN / SELJUK UNITS ──
    // 3a. 7 Mounted Faris Cavalry in the central valley vanguard
    for (let i = 0; i < 7; i++) {
      const x = (i - 3) * 5.4;
      const z = -6 - (i % 2) * 4.5;
      const unit = this._createUnitWrapper({
        faction: 'saracen',
        role: 'cavalry',
        isCompanion: false,
        isMounted: true,
        x,
        z,
        yaw: 0,
        maxHealth: 115,
        damage: 20,
      });
      this.enemies.push(unit);
      this.allUnits.push(unit);
    }

    // 3b. 10 Saracen Spearmen in the central clash & northern approach
    for (let i = 0; i < 10; i++) {
      const x = ((i % 5) - 2) * 5.2 + (Math.random() - 0.5) * 1.5;
      const z = -2 - Math.floor(i / 5) * 8.5;
      const unit = this._createUnitWrapper({
        faction: 'saracen',
        role: 'infantry',
        isCompanion: false,
        isMounted: false,
        x,
        z,
        yaw: 0,
        maxHealth: 95,
        damage: 16,
      });
      this.enemies.push(unit);
      this.allUnits.push(unit);
    }

    // 3c. 8 Saracen Composite Bowmen (6 on Eastern Archer Ridge + 2 on Northern Outpost)
    const archerPositions = [
      [43, -24],
      [44, -14],
      [44, -4],
      [43, 6],
      [42, 16],
      [45, -19],
      [-9, -52],
      [9, -52],
    ];
    for (let i = 0; i < archerPositions.length; i++) {
      const [ax, az] = archerPositions[i];
      const unit = this._createUnitWrapper({
        faction: 'saracen',
        role: 'archer',
        isCompanion: false,
        isMounted: false,
        isRidgeArcher: i < 6,
        x: ax,
        z: az,
        yaw: i < 6 ? -Math.PI * 0.5 : 0,
        maxHealth: 78,
        damage: 14,
      });
      this.enemies.push(unit);
      this.allUnits.push(unit);
    }

    // 3d. Emir Al-Kamil (Boss Commander on Royal Black Destrier at Northern Hilltop Outpost)
    this.emirBoss = this._createUnitWrapper({
      faction: 'saracen',
      role: 'commander',
      isBoss: true,
      isCompanion: false,
      isMounted: true,
      x: 0,
      z: -62,
      yaw: 0,
      maxHealth: 420,
      damage: 34,
    });
    this.enemies.push(this.emirBoss);
    this.allUnits.push(this.emirBoss);
  }

  _createUnitWrapper(cfg) {
    const id = this._nextUnitId++;
    const model = createArmyUnit({
      faction: cfg.faction,
      role: cfg.role,
      id,
    });

    if (model.setMounted && cfg.isMounted !== undefined) {
      model.setMounted(Boolean(cfg.isMounted));
    }

    const y = getTerrainHeight(cfg.x, cfg.z);
    model.root.position.set(cfg.x, y, cfg.z);
    model.root.rotation.set(0, cfg.yaw || 0, 0);
    this.unitGroup.add(model.root);

    return {
      model,
      root: model.root,
      position: model.root.position,
      faction: cfg.faction,
      role: cfg.role,
      isCompanion: Boolean(cfg.isCompanion),
      isMounted: Boolean(cfg.isMounted),
      isBoss: Boolean(cfg.isBoss),
      isRidgeArcher: Boolean(cfg.isRidgeArcher),
      companionIndex: cfg.companionIndex !== undefined ? cfg.companionIndex : -1,
      wedgeOffset: cfg.wedgeOffset || new THREE.Vector3(),
      spawnPos: new THREE.Vector3(cfg.x, y, cfg.z),
      yaw: cfg.yaw || 0,
      speed: 0,
      maxSpeed: cfg.isMounted ? 10.2 : cfg.role === 'archer' ? 4.4 : 5.4,
      maxHealth: cfg.maxHealth || 100,
      health: cfg.maxHealth || 100,
      damage: cfg.damage || 18,
      dead: false,
      deathAnim: 0,
      respawnTimer: 0,
      attackTimer: 0,
      attackCooldown: Math.random() * 0.8,
      shootCooldown: 1.0 + Math.random() * 1.8,
      hitReactTimer: 0,
      knockbackVel: new THREE.Vector3(),
      target: null,
    };
  }

  /**
   * Resets all Companions, Allies, Enemies, Morale, and Chained Objectives for Instant Restart.
   */
  reset() {
    this.companionOrder = 'follow';
    this.holdYaw = Math.PI;
    this.morale = 54;
    this.objectiveIndex = 0;
    this.vanguardKills = 0;
    this.archerKills = 0;
    this.hilltopCapture = 0;
    this.ramEscortProgress = 0;
    this.victoryTriggered = false;

    if (this.props && this.props.siegeRam) {
      const ramY = getTerrainHeight(-12, 25);
      this.props.siegeRam.position.set(-12, ramY, 25);
      this.props.siegeRam.rotation.set(0, 0, 0);
      this.props.siegeRam.progress = 0;
      this.props.siegeRam.reachedTarget = false;
    }
    if (this.props && this.props.hilltopStandard && this.props.hilltopStandard.setCaptureState) {
      this.props.hilltopStandard.setCaptureState(0, 'saracen');
    }

    for (let i = 0; i < this.allUnits.length; i++) {
      const u = this.allUnits[i];
      u.dead = false;
      u.deathAnim = 0;
      u.health = u.maxHealth;
      u.respawnTimer = 0;
      u.attackTimer = 0;
      u.hitReactTimer = 0;
      u.knockbackVel.set(0, 0, 0);
      u.root.visible = true;
      u.root.rotation.x = 0;
      u.root.rotation.z = 0;
      const sy = getTerrainHeight(u.spawnPos.x, u.spawnPos.z);
      u.position.set(u.spawnPos.x, sy, u.spawnPos.z);
      u.yaw = u.faction === 'crusader' ? Math.PI : 0;
      u.root.rotation.y = u.yaw;
    }
  }

  /**
   * Issues one of the 4 Tactical Companion Commands:
   * - 'follow'  (1: Follow / Wedge Formation)
   * - 'charge'  (2: Charge Target in player look direction)
   * - 'hold'    (3: Shield Wall / Hold Ground 8m ahead with central sightline gap)
   * - 'archers' (4: Flank & Hunt Enemy Archers)
   */
  issueCommand(order, player) {
    const valid = ['follow', 'charge', 'hold', 'archers'];
    if (!valid.includes(order)) return;

    this.companionOrder = order;
    this.orderTimer = 12.0;

    if (this.sound) {
      this.sound.playHorn(order);
    }

    // Revive any fallen companion at 60% HP on rallying war-horn call!
    for (const comp of this.companions) {
      if (comp.dead) {
        comp.dead = false;
        comp.deathAnim = 0;
        comp.health = comp.maxHealth * 0.6;
        comp.root.visible = true;
        comp.root.rotation.set(0, comp.yaw, 0);
      } else {
        comp.health = Math.min(comp.maxHealth, comp.health + 25);
      }
    }

    if (player) {
      const fwdX = Math.sin(player.cameraYaw);
      const fwdZ = Math.cos(player.cameraYaw);

      if (order === 'follow') {
        this.tacticalTarget.copy(player.position);
      } else if (order === 'charge') {
        // Look for nearest enemy along player's forward look ray, or 18m ahead
        const lookX = player.position.x + fwdX * 16;
        const lookZ = player.position.z + fwdZ * 16;
        const nearestEnemy = this.spatialGrid.findNearest(lookX, lookZ, 22, (u) => u.faction === 'saracen' && !u.dead);
        if (nearestEnemy) {
          this.tacticalTarget.copy(nearestEnemy.position);
        } else {
          this.tacticalTarget.set(lookX, getTerrainHeight(lookX, lookZ), lookZ);
        }
      } else if (order === 'hold') {
        // Place Shield Wall 8.0m ahead of player, oriented perpendicular to player's facing angle
        const holdX = player.position.x + fwdX * 8.0;
        const holdZ = player.position.z + fwdZ * 8.0;
        this.holdYaw = player.cameraYaw;
        this.tacticalTarget.set(holdX, getTerrainHeight(holdX, holdZ), holdZ);
      } else if (order === 'archers') {
        // Lock onto nearest living Saracen archer
        let bestArcher = null;
        let bestDist = Infinity;
        for (const e of this.enemies) {
          if (!e.dead && e.role === 'archer') {
            const d = e.position.distanceTo(player.position);
            if (d < bestDist) {
              bestDist = d;
              bestArcher = e;
            }
          }
        }
        if (bestArcher) {
          this.tacticalTarget.copy(bestArcher.position);
        } else {
          this.tacticalTarget.set(44, getTerrainHeight(44, -10), -10);
        }
      }

      if (this.effects) {
        this.effects.setTacticalMarker(this.tacticalTarget, order);
      }
    }

    if (this.onOrderChanged) {
      this.onOrderChanged(order);
    }
  }

  /**
   * Applies damage & knockback to an AI unit; handles kill rewards, objective progress, and morale shifts.
   * @param {object} unit
   * @param {number} amount
   * @param {THREE.Vector3|null} knockDir
   * @param {boolean} isHeavy
   * @param {boolean} fromArrow
   * @param {'player'|'companion'|'ally'} source
   */
  damageUnit(unit, amount, knockDir = null, isHeavy = false, fromArrow = false, source = 'ally') {
    if (!unit || unit.dead) return;

    // Scale background AI-on-AI damage by 0.30x so background armies fight prolonged duels
    let finalDamage = amount;
    if (source === 'ally') {
      finalDamage *= 0.30;
    }

    // Companion Shield Wall & armor damage reduction
    if (unit.isCompanion && this.companionOrder === 'hold') {
      finalDamage *= 0.25;
    } else if (unit.isCompanion) {
      finalDamage *= 0.45;
    }

    unit.health -= finalDamage;
    unit.hitReactTimer = 0.24;

    if (knockDir) {
      const force = isHeavy ? 9.5 : 4.2;
      unit.knockbackVel.set(knockDir.x * force, 0, knockDir.z * force);
    }

    if (unit.health <= 0) {
      unit.health = 0;
      unit.dead = true;
      unit.deathAnim = 0;
      unit.respawnTimer = unit.isCompanion ? 9.0 : unit.isBoss ? 999 : 11.0;

      // Death fall tilt
      unit.root.rotation.x = -Math.PI * 0.45;
      unit.position.y = getTerrainHeight(unit.position.x, unit.position.z) + 0.25;

      if (unit.faction === 'saracen') {
        const isPlayerOrCompanion = source === 'player' || source === 'companion';
        this.morale = Math.min(
          100,
          this.morale + (unit.isBoss ? 25 : isPlayerOrCompanion ? 2.5 : 0.4)
        );

        if (this.playerRef) {
          if (source === 'player') {
            this.playerRef.addScore(unit.isBoss ? 1000 : unit.isMounted ? 150 : 100, true);
          } else if (source === 'companion') {
            // Award +50 renown for companion kills without inflating player's personal kill/combo counter
            this.playerRef.addScore(unit.isBoss ? 500 : 50, false);
          }
        }

        // Only advance Vanguard / Archer kill objectives on Player or Companion kills!
        if (isPlayerOrCompanion) {
          if (this.objectiveIndex === 0) {
            this.vanguardKills++;
            if (this.vanguardKills >= 8) {
              this._advanceObjective(1, 'VANGUARD SHATTERED! +500 PTS');
            }
          } else if (this.objectiveIndex === 1 && (unit.role === 'archer' || unit.isRidgeArcher)) {
            this.archerKills++;
            if (this.archerKills >= 6) {
              this._advanceObjective(2, 'ARCHER RIDGE SILENCED! +600 PTS');
            }
          } else if (unit.isBoss && this.objectiveIndex === 4) {
            this._advanceObjective(5, 'EMIR AL-KAMIL DEFEATED! VICTORY!');
          }
        }
      } else {
        this.morale = Math.max(10, this.morale - 0.6);
      }
    }
  }

  _advanceObjective(nextIdx, bannerText) {
    this.objectiveIndex = nextIdx;
    this.morale = Math.min(100, this.morale + 12);
    if (this.playerRef) {
      this.playerRef.addScore(500, false);
      this.effects.spawnFloatingText(
        this.playerRef.position.clone().add(new THREE.Vector3(0, 2.8, 0)),
        bannerText,
        'objective'
      );
    }
    if (this.sound) {
      this.sound.playVictoryFanfare(true);
    }
    if (this.onObjectiveUpdate) {
      this.onObjectiveUpdate(this.getCurrentObjectiveData());
    }
    if (nextIdx >= 5 && !this.victoryTriggered) {
      this.victoryTriggered = true;
      if (this.onBattleVictory) {
        this.onBattleVictory();
      }
    }
  }

  /**
   * Returns structured descriptor for the active Chained Objective for HUD & Debug harness.
   */
  getCurrentObjectiveData() {
    switch (this.objectiveIndex) {
      case 0:
        return {
          index: 1,
          title: 'I. Shatter the Saracen Vanguard',
          desc: 'Charge into the valley and defeat 8 Saracen vanguard troops',
          hint: 'Hold [W] + [SPACE] for Couched Lance Charge • Press [2] for Companion Charge',
          progress: Math.min(1, this.vanguardKills / 8),
          progressText: `${Math.min(8, this.vanguardKills)} / 8 Defeated`,
        };
      case 1:
        return {
          index: 2,
          title: 'II. Silence the Eastern Archer Ridge',
          desc: 'Eliminate the Saracen Composite Bowmen on the Eastern Ridge',
          hint: 'Press [4] to order Companions to Hunt Archers on the Eastern Ridge!',
          progress: Math.min(1, this.archerKills / 6),
          progressText: `${Math.min(6, this.archerKills)} / 6 Bowmen Slain`,
        };
      case 2:
        return {
          index: 3,
          title: 'III. Seize the Hilltop Standard',
          desc: 'Ride to the Northern Outpost (z = -65) and capture the Hilltop Standard',
          hint: 'Press [3] Shield Wall inside the glowing hilltop ring to secure the plateau!',
          progress: Math.min(1, this.hilltopCapture / 100),
          progressText: `${Math.round(this.hilltopCapture)}% Captured`,
        };
      case 3:
        return {
          index: 4,
          title: 'IV. Escort the Siege Battering Ram',
          desc: 'Clear Saracen defenders as the Battering Ram advances on the northern gate',
          hint: 'Stay within 24m of the Siege Ram or command [1] Wedge Follow to escort it!',
          progress: Math.min(1, this.ramEscortProgress / 100),
          progressText: `${Math.round(this.ramEscortProgress)}% Escorted`,
        };
      default:
        const bossHp = this.emirBoss && !this.emirBoss.dead
          ? Math.max(0, Math.round((this.emirBoss.health / this.emirBoss.maxHealth) * 100))
          : 0;
        return {
          index: 5,
          title: 'V. Slay Emir Al-Kamil',
          desc: 'Defeat the Saracen Commander on his royal black destrier',
          hint: 'Focus all Companions with [2] Charge Target on Emir Al-Kamil!',
          progress: 1 - bossHp / 100,
          progressText: `Emir HP: ${bossHp}%`,
        };
    }
  }

  /**
   * Main frame update for SpatialGrid population, Companion Formation AI, Army Combat AI,
   * Archer Volleys, Reinforcement waves, and Dynamic Objectives.
   */
  update(dt, time, player, camera = null) {
    this.playerRef = player;

    // 1. Rebuild SpatialGrid for O(1) neighbor & hitbox queries
    this.spatialGrid.clear();
    if (player && !player.dead) {
      this.spatialGrid.insert(player);
    }
    for (let i = 0; i < this.allUnits.length; i++) {
      const u = this.allUnits[i];
      if (!u.dead) {
        this.spatialGrid.insert(u);
      } else {
        // Hide dead unit after death fall animation completes (0 draw calls!)
        u.deathAnim = (u.deathAnim || 0) + dt * 1.8;
        if (u.deathAnim >= 1.0 && u.root.visible) {
          u.root.visible = false;
        }

        // Handle reinforcement / companion respawn timer so battle stays action-packed
        u.respawnTimer -= dt;
        if (u.respawnTimer <= 0 && !u.isBoss) {
          this._respawnUnit(u, player);
        }
      }
    }

    // 2. Update Chained Objective Progression (Objectives 1, 2, 3, 4)
    this._updateObjectives(dt, time, player);

    // 3. Update All Units (Companions, Allied Crusaders, Enemy Saracens)
    for (let i = 0; i < this.allUnits.length; i++) {
      const u = this.allUnits[i];
      if (u.dead) continue;

      if (u.isCompanion) {
        this._updateCompanionUnit(u, dt, time, player, camera);
      } else {
        this._updateArmyUnit(u, dt, time, player);
      }
    }
  }

  _respawnUnit(u, player) {
    u.dead = false;
    u.deathAnim = 0;
    u.health = u.maxHealth;
    u.root.visible = true;
    u.root.rotation.set(0, u.yaw, 0);

    if (u.isCompanion && player) {
      const rx = player.position.x + u.wedgeOffset.x;
      const rz = player.position.z + u.wedgeOffset.z;
      u.position.set(rx, getTerrainHeight(rx, rz), rz);
    } else {
      u.position.set(
        u.spawnPos.x + (Math.random() - 0.5) * 4,
        getTerrainHeight(u.spawnPos.x, u.spawnPos.z),
        u.spawnPos.z + (Math.random() - 0.5) * 4
      );
    }
  }

  _updateObjectives(dt, time, player) {
    if (!player) return;

    // Objective 2 (index 2): Seize the Hilltop Standard at (0, -65)
    // Only advance when Player or Tactical Standard/Companions are within 18m of (0, -65)!
    if (this.objectiveIndex === 2) {
      const distPlayer = Math.hypot(player.position.x - 0, player.position.z - -65);
      const distTactical = Math.hypot(this.tacticalTarget.x - 0, this.tacticalTarget.z - -65);
      const rate = distPlayer < 18 ? 24 : distTactical < 18 ? 16 : 0;
      if (rate > 0) {
        this.hilltopCapture = Math.min(100, this.hilltopCapture + rate * dt);
        if (this.props && this.props.hilltopStandard && this.props.hilltopStandard.setCaptureState) {
          this.props.hilltopStandard.setCaptureState(
            this.hilltopCapture / 100,
            this.hilltopCapture >= 100 ? 'crusader' : 'saracen'
          );
        }
        if (this.hilltopCapture >= 100) {
          this._advanceObjective(3, 'HILLTOP STANDARD CAPTURED! +750 PTS');
        }
      }
    }

    // Objective 3 (index 3): Escort the Siege Battering Ram
    // Only advance when Player or Companions are within 24m of the Siege Ram!
    if (this.objectiveIndex === 3) {
      const ram = this.props && this.props.siegeRam;
      if (ram) {
        const distPlayerRam = Math.hypot(player.position.x - ram.position.x, player.position.z - ram.position.z);
        const compNearRam = this.companions.some(
          (c) => !c.dead && Math.hypot(c.position.x - ram.position.x, c.position.z - ram.position.z) < 24
        );
        if (distPlayerRam < 24 || compNearRam) {
          if (ram.advance) {
            const prog = ram.advance(dt, 3.2);
            this.ramEscortProgress = Math.min(100, prog * 100);
          } else {
            this.ramEscortProgress = Math.min(100, this.ramEscortProgress + 18 * dt);
          }
          if (this.ramEscortProgress >= 100) {
            this._advanceObjective(4, 'BATTERING RAM BREACHED THE GATE! +800 PTS');
          }
        }
      }
    }
  }

  _updateCompanionUnit(u, dt, time, player, camera = null) {
    u.hitReactTimer = Math.max(0, u.hitReactTimer - dt);
    u.attackCooldown = Math.max(0, u.attackCooldown - dt);

    // Hide overhead companion chevron diamond if companion is within 4.5m of the camera lens
    if (u.model && u.model.rig && u.model.rig.companionMarker && camera) {
      const distCam = camera.position.distanceTo(u.root.position);
      const chevron = u.model.rig.companionMarker.getObjectByName('companionChevron');
      if (chevron) {
        chevron.visible = distCam >= 4.5;
        chevron.scale.set(0.65, 0.9, 0.4);
      }
    }

    // Apply decaying knockback
    if (u.knockbackVel.lengthSq() > 0.05) {
      u.position.x += u.knockbackVel.x * dt;
      u.position.z += u.knockbackVel.z * dt;
      u.knockbackVel.multiplyScalar(Math.max(0, 1 - 8 * dt));
    }

    let goalX = u.position.x;
    let goalZ = u.position.z;
    let engageRadius = 9.0;
    let speedMult = 1.0;
    let shieldBlock = false;
    let useLance = false;

    if (this.companionOrder === 'follow' && player) {
      // Rotate wedge offset by player yaw; all offsets have |x| >= 2.8 to keep camera sightline open
      const cosY = Math.cos(player.yaw);
      const sinY = Math.sin(player.yaw);
      const wx = u.wedgeOffset.x * cosY - u.wedgeOffset.z * sinY;
      const wz = -u.wedgeOffset.x * sinY - u.wedgeOffset.z * cosY;
      goalX = player.position.x + wx;
      goalZ = player.position.z + wz;
      engageRadius = 8.5;
    } else if (this.companionOrder === 'charge') {
      const chargeSlots = [-4.0, -2.4, -1.2, 1.2, 2.4, 4.0];
      const slotX = chargeSlots[u.companionIndex] || 0;
      goalX = this.tacticalTarget.x + slotX;
      goalZ = this.tacticalTarget.z;
      engageRadius = 18.0;
      speedMult = 1.35;
      useLance = u.isMounted;
    } else if (this.companionOrder === 'hold') {
      // Interlocking Shield Wall line perpendicular to holdYaw with a 3.6m central gap for camera visibility!
      const slotOffsets = [-4.6, -3.1, -1.8, 1.8, 3.1, 4.6];
      const slotOffset = slotOffsets[u.companionIndex] || 0;
      const rightX = -Math.cos(this.holdYaw);
      const rightZ = Math.sin(this.holdYaw);
      goalX = this.tacticalTarget.x + rightX * slotOffset;
      goalZ = this.tacticalTarget.z + rightZ * slotOffset;
      engageRadius = 3.2;
      shieldBlock = true;
    } else if (this.companionOrder === 'archers') {
      // Find nearest living Saracen archer
      const archer = this.spatialGrid.findNearest(u.position.x, u.position.z, 95, (e) => {
        return e.faction === 'saracen' && !e.dead && e.role === 'archer';
      });
      if (archer) {
        goalX = archer.position.x;
        goalZ = archer.position.z;
      } else {
        goalX = this.tacticalTarget.x;
        goalZ = this.tacticalTarget.z;
      }
      engageRadius = 14.0;
      speedMult = 1.28;
    }

    // Check for enemy target within engagement radius
    const enemy =
      this.spatialGrid.findNearest(u.position.x, u.position.z, engageRadius, (e) => {
        if (e.faction !== 'saracen' || e.dead) return false;
        if (this.companionOrder === 'archers' && e.role !== 'archer') {
          return false;
        }
        return true;
      }) ||
      this.spatialGrid.findNearest(
        u.position.x,
        u.position.z,
        engageRadius,
        (e) => e.faction === 'saracen' && !e.dead
      );

    if (enemy && this.companionOrder !== 'hold') {
      goalX = enemy.position.x;
      goalZ = enemy.position.z;
    }

    // Move & Separate
    const sep = this.spatialGrid.computeSeparation(u, u.isMounted ? 2.1 : 1.45);
    const dx = goalX - u.position.x + sep.x * 2.2;
    const dz = goalZ - u.position.z + sep.z * 2.2;
    const dist = Math.hypot(dx, dz);

    const stopDist = enemy ? (u.isMounted ? 2.1 : 1.55) : 0.9;
    if (dist > stopDist) {
      const desiredSpeed = u.maxSpeed * speedMult;
      u.speed += (desiredSpeed - u.speed) * Math.min(1, 10 * dt);
      const targetYaw = Math.atan2(dx, dz);
      let diff = targetYaw - u.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      u.yaw += diff * Math.min(1, 10 * dt);

      u.position.x += (dx / dist) * u.speed * dt;
      u.position.z += (dz / dist) * u.speed * dt;
    } else {
      u.speed *= Math.max(0, 1 - 12 * dt);
      if (enemy) {
        u.yaw = Math.atan2(enemy.position.x - u.position.x, enemy.position.z - u.position.z);
      } else if (this.companionOrder === 'hold') {
        u.yaw = this.holdYaw;
      }
    }

    u.position.y = getTerrainHeight(u.position.x, u.position.z);
    u.root.position.copy(u.position);
    u.root.rotation.set(0, u.yaw, 0);

    // Melee Attack on nearby Enemy (pass source = 'companion')
    if (enemy) {
      const dEnemy = u.position.distanceTo(enemy.position);
      const reach = u.isMounted ? 2.8 : 2.1;
      if (dEnemy <= reach && u.attackCooldown <= 0) {
        u.attackTimer = 0.36;
        u.attackCooldown = 0.85 + Math.random() * 0.35;
        const knock = new THREE.Vector3(Math.sin(u.yaw), 0.15, Math.cos(u.yaw));
        this.damageUnit(enemy, u.damage, knock, useLance, false, 'companion');
        if (player && u.position.distanceTo(player.position) < 18) {
          this.effects.spawnSparks(enemy.position.clone().add(new THREE.Vector3(0, 1.3, 0)), 5, true);
        }
      }
    }

    if (u.attackTimer > 0) u.attackTimer = Math.max(0, u.attackTimer - dt);
    const attackProgress = u.attackTimer > 0 ? 1 - u.attackTimer / 0.36 : 0;

    u.model.updateAnimation(dt, {
      time,
      speed: u.speed,
      attackProgress,
      attackType: useLance ? 'lance' : 'slash',
      shieldBlock,
      useLance,
      hitReact: u.hitReactTimer > 0 ? 1 : 0,
    });
  }

  _updateArmyUnit(u, dt, time, player) {
    u.hitReactTimer = Math.max(0, u.hitReactTimer - dt);
    u.attackCooldown = Math.max(0, u.attackCooldown - dt);

    if (u.knockbackVel.lengthSq() > 0.05) {
      u.position.x += u.knockbackVel.x * dt;
      u.position.z += u.knockbackVel.z * dt;
      u.knockbackVel.multiplyScalar(Math.max(0, 1 - 8 * dt));
    }

    const oppFaction = u.faction === 'crusader' ? 'saracen' : 'crusader';

    // 1. Ranged Archers / Crossbowmen Logic
    if (u.role === 'archer') {
      u.shootCooldown -= dt;
      let target = this.spatialGrid.findNearest(u.position.x, u.position.z, 56, (other) => {
        return other.faction === oppFaction && !other.dead;
      });
      if (!target && oppFaction === 'crusader' && player && !player.dead) {
        if (u.position.distanceTo(player.position) < 58) target = player;
      }

      if (target) {
        const dx = target.position.x - u.position.x;
        const dz = target.position.z - u.position.z;
        u.yaw = Math.atan2(dx, dz);
        u.root.rotation.set(0, u.yaw, 0);

        if (u.shootCooldown <= 0) {
          u.shootCooldown = 2.4 + Math.random() * 1.4;
          u.attackTimer = 0.4;

          const dist = Math.hypot(dx, dz);
          const flightTime = Math.max(0.35, dist / 28);
          const origin = u.position.clone().add(new THREE.Vector3(0, 1.45, 0));
          const vx = dx / flightTime + (Math.random() - 0.5) * 1.8;
          const vz = dz / flightTime + (Math.random() - 0.5) * 1.8;
          const vy = (target.position.y - u.position.y) / flightTime + 0.5 * 13.5 * flightTime;

          this.effects.spawnArrow(origin, new THREE.Vector3(vx, vy, vz), u.faction, u.damage);
          if (player && u.position.distanceTo(player.position) < 25) {
            this.sound.playBowTwang();
          }
        }
      }

      if (u.attackTimer > 0) u.attackTimer = Math.max(0, u.attackTimer - dt);
      u.model.updateAnimation(dt, {
        time,
        speed: 0,
        attackProgress: u.attackTimer > 0 ? 1 - u.attackTimer / 0.4 : 0,
        hitReact: u.hitReactTimer > 0 ? 1 : 0,
      });
      return;
    }

    // 2. Melee / Cavalry Unit Logic
    let target = this.spatialGrid.findNearest(u.position.x, u.position.z, 32, (other) => {
      return other.faction === oppFaction && !other.dead;
    });
    if (oppFaction === 'crusader' && player && !player.dead) {
      const dPlayer = u.position.distanceTo(player.position);
      if (!target || dPlayer < u.position.distanceTo(target.position) * 0.85) {
        if (dPlayer < 28) target = player;
      }
    }

    let goalX = target ? target.position.x : u.spawnPos.x * 0.6;
    let goalZ = target ? target.position.z : u.faction === 'crusader' ? -8 : 6;

    // Keep Boss Emir near Northern Hilltop until Objective 4 or approached
    if (u.isBoss && this.objectiveIndex < 3 && (!player || u.position.distanceTo(player.position) > 22)) {
      goalX = 0;
      goalZ = -60;
      target = null;
    }

    const sep = this.spatialGrid.computeSeparation(u, u.isMounted ? 2.1 : 1.45);
    const dx = goalX - u.position.x + sep.x * 2.0;
    const dz = goalZ - u.position.z + sep.z * 2.0;
    const dist = Math.hypot(dx, dz);
    const stopDist = u.isMounted ? 2.2 : 1.65;

    if (dist > stopDist) {
      u.speed += (u.maxSpeed - u.speed) * Math.min(1, 8 * dt);
      const targetYaw = Math.atan2(dx, dz);
      let diff = targetYaw - u.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      u.yaw += diff * Math.min(1, 8 * dt);

      u.position.x += (dx / dist) * u.speed * dt;
      u.position.z += (dz / dist) * u.speed * dt;
    } else {
      u.speed *= Math.max(0, 1 - 10 * dt);
      if (target) {
        u.yaw = Math.atan2(target.position.x - u.position.x, target.position.z - u.position.z);
      }
    }

    u.position.y = getTerrainHeight(u.position.x, u.position.z);
    u.root.position.copy(u.position);
    u.root.rotation.set(0, u.yaw, 0);

    // Melee strike check (pass source = 'ally')
    if (target && !target.dead) {
      const dTarget = u.position.distanceTo(target.position);
      const reach = u.isMounted ? 2.75 : 2.05;
      if (dTarget <= reach && u.attackCooldown <= 0) {
        u.attackTimer = 0.38;
        u.attackCooldown = 1.05 + Math.random() * 0.55;
        if (target.isPlayer) {
          target.receiveDamage(u.damage, u.position, false);
        } else {
          const knock = new THREE.Vector3(Math.sin(u.yaw), 0.1, Math.cos(u.yaw));
          this.damageUnit(target, u.damage, knock, false, false, 'ally');
        }
      }
    }

    if (u.attackTimer > 0) u.attackTimer = Math.max(0, u.attackTimer - dt);
    const attackProgress = u.attackTimer > 0 ? 1 - u.attackTimer / 0.38 : 0;

    u.model.updateAnimation(dt, {
      time,
      speed: u.speed,
      attackProgress,
      hitReact: u.hitReactTimer > 0 ? 1 : 0,
    });
  }
}
