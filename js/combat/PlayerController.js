import * as THREE from '../vendor/three.module.js';
import { createCrusaderKnight } from '../entities/CrusaderKnight.js';
import { createWarhorse } from '../entities/Warhorse.js';
import { getTerrainHeight, getTerrainNormal } from '../world/Battlefield.js';

/**
 * PlayerController.js
 * Seamless Mounted & Dismounted Crusader Knight controller:
 * - Mounted Destrier physics, Couched Lance Charge (Space), Horseback Sword Sweeps (LMB), Shield Guard (RMB)
 * - Instant Dismount / Remount ('E' or UI button) leaving the Warhorse active in the world with a call/whistle system
 * - On-Foot 3-hit directional sword combo (slash -> sweep -> overhead cleave), Shield Bash & Block, and Dodge-Roll
 * - Third-person spring-arm camera with trauma shake & 40ms micro hit-stop
 */
export class PlayerController {
  constructor(scene, camera, soundManager, effectsManager) {
    this.scene = scene;
    this.camera = camera;
    this.sound = soundManager;
    this.effects = effectsManager;

    // Build Player Crusader Knight & Dapple-Grey Destrier Warhorse
    this.knight = createCrusaderKnight({
      isPlayer: true,
      isCompanion: false,
      mounted: true,
      variant: 'crusader_red',
    });

    this.horse = createWarhorse({
      coat: 'dapple_grey',
      barding: 'crusader_red',
      isPlayerHorse: true,
    });
    this.scene.add(this.horse.root);

    // State & Vitals
    this.faction = 'crusader';
    this.isPlayer = true;
    this.dead = false;
    this.maxHealth = 220;
    this.health = 220;
    this.maxStamina = 100;
    this.stamina = 100;
    this.maxHorseHealth = 180;
    this.horseHealth = 180;

    // Transform & Locomotion
    this.isMounted = true;
    this.position = new THREE.Vector3(0, getTerrainHeight(0, 22), 22);
    this.velocity = new THREE.Vector3();
    this.horsePosition = new THREE.Vector3(0, getTerrainHeight(0, 22), 22);
    this.horseYaw = Math.PI; // Facing North (-Z) toward the Saracen army
    this.yaw = Math.PI;
    this.speed = 0;
    this.horseCalling = false;

    // Camera Orbit, Binding & Trauma Shake
    // By default, camera is bound directly behind the character (follows this.yaw).
    // Holding Right-Click (or Middle-Click) or toggling [C] unbinds for 360° free-look.
    this.cameraYaw = Math.PI;
    this.cameraPitch = 0.26;
    this.cameraFreeLookHeld = false;
    this.cameraFreeLookToggled = false;
    this.cameraTrauma = 0;
    this.hitStopTimer = 0;
    this._camTarget = new THREE.Vector3();
    this._camPos = new THREE.Vector3();

    // Combat State
    this.attackTimer = 0;
    this.attackDuration = 0.36;
    this.attackHitApplied = false;
    this.comboStep = 0;
    this.comboResetTimer = 0;
    this.attackType = 'slash';
    this.isBlocking = false;
    this.shieldBashTimer = 0;
    this.lanceChargeTimer = 0;
    this.lanceCooldown = 0;
    this.useLance = false;
    this.dodgeTimer = 0;
    this.dodgeDir = new THREE.Vector3();
    this.invulnTimer = 0;
    this.hitReactTimer = 0;
    this.mountCooldown = 0;
    this._hoofTimer = 0;
    this._lanceHitSet = new Set();

    // Score & Combo Tracking
    this.score = 0;
    this.kills = 0;
    this.comboCount = 0;
    this.comboMultiplier = 1;
    this.comboDecayTimer = 0;

    // Input State (Desktop WASD + Mouse + Mobile Touch)
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      space: false,
    };
    this.joyVec = { x: 0, y: 0 };
    this.inputEnabled = true;
    this.isPointerLocked = false;
    this._isDraggingLook = false;
    this._hasMousePos = false;
    this._lastMouseX = 0;
    this._lastMouseY = 0;

    // Callbacks
    this.onCompanionCommand = null;
    this.onTogglePause = null;
    this.onMountChanged = null;
    this.onCameraModeChanged = null;

    this._attachKnightToSaddle();
    this._syncTransforms();
    this._bindInputs();
  }

  isCameraUnbound() {
    return this.cameraFreeLookHeld || this.cameraFreeLookToggled;
  }

  toggleCameraFreeLook(forceValue = null) {
    this.cameraFreeLookToggled = forceValue !== null ? Boolean(forceValue) : !this.cameraFreeLookToggled;
    if (!this.isCameraUnbound()) {
      // Snap target back toward character yaw
      this._hasMousePos = false;
    }
    if (this.onCameraModeChanged) {
      this.onCameraModeChanged(this.isCameraUnbound());
    }
    return this.isCameraUnbound();
  }

  _attachKnightToSaddle() {
    if (this.horse && this.horse.saddleMountPoint) {
      this.horse.saddleMountPoint.add(this.knight.root);
    } else {
      this.horse.root.add(this.knight.root);
    }
    this.knight.root.position.set(0, 0, 0);
    this.knight.root.rotation.set(0, 0, 0);
    this.knight.setMountedPose(true);
  }

  _detachKnightToGround(groundPos) {
    this.scene.add(this.knight.root);
    this.knight.setMountedPose(false);
    this.knight.root.position.copy(groundPos);
    this.knight.root.rotation.set(0, this.yaw, 0);
  }

  reset() {
    this.dead = false;
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.horseHealth = this.maxHorseHealth;
    this.score = 0;
    this.kills = 0;
    this.comboCount = 0;
    this.comboMultiplier = 1;
    this.comboDecayTimer = 0;

    this.isMounted = true;
    this.useLance = false;
    this.lanceChargeTimer = 0;
    this.attackTimer = 0;
    this.isBlocking = false;
    this.dodgeTimer = 0;
    this.invulnTimer = 0;
    this.cameraTrauma = 0;
    this.hitStopTimer = 0;
    this.horseCalling = false;

    this.yaw = Math.PI;
    this.horseYaw = Math.PI;
    this.cameraYaw = Math.PI;
    this.cameraPitch = 0.26;
    this.cameraFreeLookHeld = false;
    this.cameraFreeLookToggled = false;
    this.speed = 0;
    this.velocity.set(0, 0, 0);

    const startY = getTerrainHeight(0, 22);
    this.position.set(0, startY, 22);
    this.horsePosition.set(0, startY, 22);

    this._attachKnightToSaddle();
    this._syncTransforms();
    if (this.onMountChanged) this.onMountChanged(true);
    if (this.onCameraModeChanged) this.onCameraModeChanged(false);
  }

  _bindInputs() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = true;
          break;
        case 'Space':
          this.keys.space = true;
          this.triggerSpecialAction();
          break;
        case 'KeyE':
          this.toggleMount();
          break;
        case 'KeyC':
          this.toggleCameraFreeLook();
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
        case 'KeyF':
          this.setBlocking(true);
          break;
        case 'Digit1':
          if (this.onCompanionCommand) this.onCompanionCommand('follow');
          break;
        case 'Digit2':
          if (this.onCompanionCommand) this.onCompanionCommand('charge');
          break;
        case 'Digit3':
          if (this.onCompanionCommand) this.onCompanionCommand('hold');
          break;
        case 'Digit4':
          if (this.onCompanionCommand) this.onCompanionCommand('archers');
          break;
        case 'KeyP':
        case 'Escape':
          if (this.onTogglePause) this.onTogglePause();
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = false;
          break;
        case 'Space':
          this.keys.space = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
        case 'KeyF':
          this.setBlocking(false);
          break;
      }
    });

    window.addEventListener('mousedown', (e) => {
      // Ignore clicks on UI buttons/modals
      if (e.target && e.target.closest && e.target.closest('button, .ui-interactive, .modal-card')) {
        return;
      }
      if (e.button === 0) {
        this.triggerPrimaryAttack();
        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;
        this._hasMousePos = true;
      } else if (e.button === 2 || e.button === 1) {
        // Right-Click or Middle-Click unbinds camera for 360° Free-Look drag
        this.cameraFreeLookHeld = true;
        this._isDraggingLook = true;
        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;
        this._hasMousePos = true;
        if (e.button === 2) {
          this.setBlocking(true);
        }
        if (this.onCameraModeChanged) {
          this.onCameraModeChanged(this.isCameraUnbound());
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 2 || e.button === 1) {
        this.cameraFreeLookHeld = false;
        this._isDraggingLook = false;
        if (e.button === 2) {
          this.setBlocking(false);
        }
        if (this.onCameraModeChanged) {
          this.onCameraModeChanged(this.isCameraUnbound());
        }
      }
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('mousemove', (e) => {
      if (!this.inputEnabled) return;
      // Only rotate camera independently when unbound (holding Right-Click / Middle-Click or toggled with [C])
      if (!this.isCameraUnbound()) {
        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;
        this._hasMousePos = true;
        return;
      }
      if (e.target && e.target.closest && e.target.closest('button, .hud-panel, .modal-card')) {
        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;
        this._hasMousePos = true;
        return;
      }
      if (!this._hasMousePos) {
        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;
        this._hasMousePos = true;
        return;
      }
      const dx = (e.movementX !== undefined && e.movementX !== 0) ? e.movementX : (e.clientX - this._lastMouseX);
      const dy = (e.movementY !== undefined && e.movementY !== 0) ? e.movementY : (e.clientY - this._lastMouseY);
      this._lastMouseX = e.clientX;
      this._lastMouseY = e.clientY;
      const sens = 0.0052;
      this.cameraYaw -= dx * sens;
      this.cameraPitch = Math.max(0.06, Math.min(0.78, this.cameraPitch + dy * (sens * 0.8)));
    });
  }

  /**
   * Seamless Mount / Dismount ('E' or HUD button).
   * - When Mounted: vaults cleanly onto the ground while placing the Warhorse 2.4m to the player's left-forward
   *   so the warhorse never blocks the third-person camera sightline!
   * - When On Foot: mounts immediately if close to horse, or whistles to summon the warhorse at a gallop!
   */
  toggleMount(forceState = null, silent = false) {
    if (this.dead) return;
    if (forceState === null && this.mountCooldown > 0) return;
    this.mountCooldown = 0.35;

    const targetMounted = forceState !== null ? forceState : !this.isMounted;

    if (!targetMounted && this.isMounted) {
      // Dismount onto foot, placing the Warhorse 2.4m to the player's left-forward (-right * 2.2 + fwd * 1.0)
      this.isMounted = false;
      this.lanceChargeTimer = 0;
      this.useLance = false;
      this.horseYaw = this.yaw;

      const fwdX = Math.sin(this.yaw);
      const fwdZ = Math.cos(this.yaw);
      const rightX = -Math.cos(this.yaw);
      const rightZ = Math.sin(this.yaw);

      this.position.y = getTerrainHeight(this.position.x, this.position.z);
      const hx = this.position.x - rightX * 2.2 + fwdX * 1.0;
      const hz = this.position.z - rightZ * 2.2 + fwdZ * 1.0;
      this.horsePosition.set(hx, getTerrainHeight(hx, hz), hz);
      this.speed = Math.min(this.speed, 4.0);

      this._detachKnightToGround(this.position);
      this._syncTransforms();

      if (!silent) {
        this.sound.playMountToggle(false, false);
        this.effects.spawnDust(this.position, 5, 0.9);
        this.effects.spawnFloatingText(
          this.position.clone().add(new THREE.Vector3(0, 2.1, 0)),
          'DISMOUNTED — ON FOOT',
          'parry'
        );
      }
      if (this.onMountChanged) this.onMountChanged(false);
    } else if (targetMounted && !this.isMounted) {
      const distToHorse = this.position.distanceTo(this.horsePosition);
      if (distToHorse <= 8.5 || forceState === true) {
        // Vault directly into the saddle!
        this.isMounted = true;
        this.horseCalling = false;
        if (forceState === true) {
          this.horsePosition.copy(this.position);
        } else {
          this.position.copy(this.horsePosition);
        }
        this.yaw = this.horseYaw;
        if (this.horseHealth <= 20) this.horseHealth = 85;
        this._attachKnightToSaddle();
        this._syncTransforms();
        if (!silent) {
          this.sound.playMountToggle(true, false);
          this.effects.spawnDust(this.position, 6, 1.1);
          this.effects.spawnFloatingText(
            this.position.clone().add(new THREE.Vector3(0, 2.6, 0)),
            'MOUNTED DESTRIER!',
            'lance'
          );
        }
        if (this.onMountChanged) this.onMountChanged(true);
      } else {
        // Whistle to summon the Warhorse from across the battlefield!
        this.horseCalling = true;
        if (!silent) {
          this.sound.playMountToggle(true, true);
          this.effects.spawnFloatingText(
            this.position.clone().add(new THREE.Vector3(0, 2.2, 0)),
            'WHISTLED FOR WARHORSE!',
            'parry'
          );
        }
      }
    }
  }

  /**
   * Primary Attack (Left Click / Touch Slash Button):
   * - Mounted: Wide sweeping horseback broadsword slashes (or lance thrust if charging)
   * - On Foot: 3-Hit directional sword combo (Slash -> Reverse Sweep -> Overhead Cleave)
   */
  triggerPrimaryAttack() {
    if (this.dead) return;

    // If holding block on foot, Left Click performs an immediate Shield Bash!
    if (this.isBlocking && !this.isMounted && this.shieldBashTimer <= 0) {
      this.triggerShieldBash();
      return;
    }

    if (this.attackTimer > 0.08) return;

    if (this.comboResetTimer > 0) {
      this.comboStep = (this.comboStep + 1) % 3;
    } else {
      this.comboStep = 0;
    }

    if (this.isMounted) {
      this.attackDuration = 0.36;
      this.attackType = this.lanceChargeTimer > 0 ? 'lance' : this.comboStep === 2 ? 'cleave' : 'slash';
    } else {
      if (this.comboStep === 0) {
        this.attackType = 'slash';
        this.attackDuration = 0.32;
      } else if (this.comboStep === 1) {
        this.attackType = 'thrust';
        this.attackDuration = 0.32;
      } else {
        this.attackType = 'cleave';
        this.attackDuration = 0.42;
      }
    }

    this.attackTimer = this.attackDuration;
    this.comboResetTimer = 0.95;
    this.attackHitApplied = false;
    this.isBlocking = false;
    this.sound.playSwordSwing(this.comboStep);
  }

  /**
   * Special Action (Spacebar / Touch Charge-Dodge Button):
   * - Mounted: Spurs warhorse into a high-speed Couched Lance Gallop Charge!
   * - On Foot: Executes an agile directional Dodge-Roll with invulnerability frames!
   */
  triggerSpecialAction() {
    if (this.dead) return;

    if (this.isMounted) {
      if (this.lanceChargeTimer <= 0 && this.stamina >= 22) {
        this.stamina = Math.max(0, this.stamina - 22);
        this.lanceChargeTimer = 2.6;
        this.useLance = true;
        this._lanceHitSet.clear();
        this.speed = Math.max(this.speed, 13.5);
        this.sound.playSwordSwing(2);
        this.effects.spawnDust(this.position, 8, 1.35);
        this.effects.spawnFloatingText(
          this.position.clone().add(new THREE.Vector3(0, 2.7, 0)),
          'COUCHED LANCE CHARGE!',
          'lance'
        );
      }
    } else {
      if (this.dodgeTimer <= 0 && this.stamina >= 18) {
        this.stamina = Math.max(0, this.stamina - 18);
        this.dodgeTimer = 0.32;
        this.invulnTimer = 0.40;

        // Dodge in movement direction or forward facing
        const moveInput = this._getMoveInputVector();
        if (moveInput.lengthSq() > 0.05) {
          this.dodgeDir.copy(moveInput).normalize();
          this.yaw = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
        } else {
          this.dodgeDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        }
        this.sound.playSwordSwing(1);
        this.effects.spawnDust(this.position, 6, 1.1);
      }
    }
  }

  /**
   * Raises or lowers the Heater Shield (Right Click / Touch Shield Button).
   * On foot, pressing block also checks for close-quarters Shield Bash stagger.
   */
  setBlocking(active) {
    if (this.dead) {
      this.isBlocking = false;
      return;
    }
    if (active && !this.isBlocking && !this.isMounted && this.shieldBashTimer <= 0 && this.stamina >= 12) {
      this.triggerShieldBash();
    }
    this.isBlocking = active;
  }

  triggerShieldBash() {
    this.stamina = Math.max(0, this.stamina - 12);
    this.shieldBashTimer = 0.28;
    this.attackHitApplied = false;
    this.sound.playShieldBlock(false);
  }

  _getMoveInputVector() {
    let f = (this.keys.forward ? 1 : 0) - (this.keys.backward ? 1 : 0) - this.joyVec.y;
    let s = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0) + this.joyVec.x;
    f = Math.max(-1, Math.min(1, f));
    s = Math.max(-1, Math.min(1, s));

    const fwdX = Math.sin(this.cameraYaw);
    const fwdZ = Math.cos(this.cameraYaw);
    const rightX = -Math.cos(this.cameraYaw);
    const rightZ = Math.sin(this.cameraYaw);

    return new THREE.Vector3(fwdX * f + rightX * s, 0, fwdZ * f + rightZ * s);
  }

  addTrauma(amount) {
    this.cameraTrauma = Math.min(1.0, this.cameraTrauma + amount);
  }

  triggerHitStop(duration = 0.042) {
    this.hitStopTimer = Math.max(this.hitStopTimer, duration);
  }

  addScore(points, isKill = false) {
    if (isKill) {
      this.kills++;
      this.comboCount++;
      this.comboDecayTimer = 4.5;
      this.comboMultiplier = Math.min(5, 1 + Math.floor(this.comboCount / 2));
    }
    this.score += Math.round(points * this.comboMultiplier);
  }

  /**
   * Handles incoming melee or arrow damage to the Player (or Warhorse).
   */
  receiveDamage(amount, attackerPos = null, isArrow = false) {
    if (this.dead || this.invulnTimer > 0) return;

    // Check Shield Block / Parry
    if (this.isBlocking) {
      const reduced = Math.max(1, Math.round(amount * 0.18));
      this.health = Math.max(1, this.health - reduced);
      this.stamina = Math.max(0, this.stamina - 8);
      this.sound.playShieldBlock(true);
      const sparkPos = this.position.clone().add(new THREE.Vector3(0, this.isMounted ? 1.7 : 1.2, 0));
      this.effects.spawnSparks(sparkPos, 10, true);
      this.effects.spawnFloatingText(
        sparkPos,
        isArrow ? 'ARROW DEFLECTED!' : 'SHIELD PARRY!',
        'parry'
      );
      this.addTrauma(0.15);
      return;
    }

    this.health = Math.max(0, this.health - amount);
    this.hitReactTimer = 0.25;
    this.invulnTimer = 0.22;
    this.addTrauma(0.32);
    this.sound.playSwordHit(false);

    const hitPos = this.position.clone().add(new THREE.Vector3(0, this.isMounted ? 1.6 : 1.15, 0));
    this.effects.spawnHitBurst(hitPos, 6);

    // If mounted, horse also shares a portion of heavy melee damage
    if (this.isMounted && !isArrow) {
      this.horseHealth = Math.max(0, this.horseHealth - amount * 0.35);
      if (this.horseHealth <= 0) {
        // Warhorse exhausted -> emergency dismount onto foot!
        this.horseHealth = 35;
        this.toggleMount(false);
      }
    }

    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  /**
   * Main frame update for Player locomotion, combat hitboxes, horse AI when dismounted, and camera.
   */
  update(dt, time, spatialGrid, battleAI, colliders = []) {
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      this._updateCamera(dt, time);
      return true; // Signals active micro hit-stop
    }

    // Cooldowns & regeneration
    this.mountCooldown = Math.max(0, this.mountCooldown - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.hitReactTimer = Math.max(0, this.hitReactTimer - dt);
    this.comboResetTimer = Math.max(0, this.comboResetTimer - dt);

    if (this.comboDecayTimer > 0) {
      this.comboDecayTimer -= dt;
      if (this.comboDecayTimer <= 0) {
        this.comboCount = 0;
        this.comboMultiplier = 1;
      }
    }

    // Stamina & gradual health recovery
    if (this.lanceChargeTimer <= 0 && this.dodgeTimer <= 0 && !this.isBlocking) {
      this.stamina = Math.min(this.maxStamina, this.stamina + 18 * dt);
    }
    if (!this.dead && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 2.2 * dt);
    }
    if (!this.isMounted && this.horseHealth < this.maxHorseHealth) {
      this.horseHealth = Math.min(this.maxHorseHealth, this.horseHealth + 8.0 * dt);
    }

    // 1. Locomotion Update (Mounted vs On Foot)
    if (this.isMounted) {
      this._updateMountedLocomotion(dt, time, spatialGrid, battleAI, colliders);
    } else {
      this._updateOnFootLocomotion(dt, time, colliders);
      this._updateUnmountedHorse(dt, time);
    }

    // 2. Active Combat Hit Detection (Sword Slashes, Cleaves, Shield Bash)
    this._updateCombatHits(dt, spatialGrid, battleAI);

    // 3. Update Skeletal Animations on Knight & Warhorse
    const attackProgress =
      this.attackTimer > 0 ? 1 - this.attackTimer / Math.max(0.01, this.attackDuration) : 0;

    this.knight.updateAnimation(dt, {
      time,
      speed: this.speed,
      isMounted: this.isMounted,
      attackProgress,
      attackType: this.attackType,
      shieldBlock: this.isBlocking || this.shieldBashTimer > 0,
      useLance: this.useLance || this.lanceChargeTimer > 0,
      hitReact: this.hitReactTimer > 0 ? 1 : 0,
    });

    const horseSpeed = this.isMounted ? this.speed : this.horseCalling ? 11.5 : 0;
    this.horse.updateAnimation(dt, {
      time,
      speed: horseSpeed,
      rearProgress: 0,
    });

    // Update floating beacon above warhorse when player is dismounted
    this.effects.updateHorseBeacon(this.isMounted, this.horsePosition, time, this.position);

    // 4. Update Third-Person Spring-Arm Camera
    this._updateCamera(dt, time);
    return false;
  }

  _updateMountedLocomotion(dt, time, spatialGrid, battleAI, colliders) {
    let throttle = (this.keys.forward ? 1 : 0) - (this.keys.backward ? 1 : 0) - this.joyVec.y;
    let steer = (this.keys.left ? 1 : 0) - (this.keys.right ? 1 : 0) - this.joyVec.x;

    if (this.lanceChargeTimer > 0) {
      this.lanceChargeTimer -= dt;
      throttle = 1.0; // Full gallop surge during Couched Lance Charge
      if (this.lanceChargeTimer <= 0) {
        this.useLance = false;
      }
    }

    const maxSpeed = this.lanceChargeTimer > 0 ? 16.5 : 11.8;
    const targetSpeed = throttle >= 0 ? throttle * maxSpeed : throttle * 4.5;
    const accel = throttle > 0 ? 14.0 : 18.0;
    this.speed += (targetSpeed - this.speed) * Math.min(1, accel * dt);

    // Turn warhorse via A/D (or Left/Right arrows). Camera stays bound behind character unless unbound.
    const turnRate = (2.65 - Math.min(0.75, Math.abs(this.speed) / 22)) * steer;
    this.yaw += turnRate * dt;

    // Keep camera locked behind horse when bound
    if (!this.isCameraUnbound() && Math.abs(steer) > 0.01) {
      let yawDiff = this.yaw - this.cameraYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      if (Math.abs(yawDiff) < 0.5) {
        this.cameraYaw = this.yaw;
      }
    }

    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    this.velocity.set(fwdX * this.speed, 0, fwdZ * this.speed);

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this._constrainToWorldAndColliders(this.position, 1.15, colliders);
    this.position.y = getTerrainHeight(this.position.x, this.position.z);

    this.horsePosition.copy(this.position);
    this.horseYaw = this.yaw;
    this._syncTransforms();

    // Hoofbeats & Dust Puffs
    if (Math.abs(this.speed) > 1.8) {
      const stepInterval = Math.max(0.16, 0.42 - Math.abs(this.speed) * 0.018);
      this._hoofTimer += dt;
      if (this._hoofTimer >= stepInterval) {
        this._hoofTimer = 0;
        this.sound.playHoofbeat(Math.abs(this.speed) / maxSpeed);
        if (Math.abs(this.speed) > 6.5) {
          this.effects.spawnDust(this.position, this.lanceChargeTimer > 0 ? 4 : 2, 1.0);
        }
      }
    }

    // Couched Lance Charge & Horse Trample Hit Detection
    if (spatialGrid && battleAI && (this.lanceChargeTimer > 0 || this.speed > 9.5)) {
      const isCouched = this.lanceChargeTimer > 0;
      const tipX = this.position.x + fwdX * (isCouched ? 2.4 : 1.3);
      const tipZ = this.position.z + fwdZ * (isCouched ? 2.4 : 1.3);
      const hitRadius = isCouched ? 2.2 : 1.45;

      const targets = spatialGrid.queryRadius(tipX, tipZ, hitRadius, (u) => {
        return u.faction === 'saracen' && !u.dead && !this._lanceHitSet.has(u);
      });

      for (let i = 0; i < targets.length; i++) {
        const enemy = targets[i];
        this._lanceHitSet.add(enemy);
        const dmg = isCouched ? 220 : 55;
        const knockDir = new THREE.Vector3(fwdX, 0.35, fwdZ).normalize();
        battleAI.damageUnit(enemy, dmg, knockDir, true, false, 'player');

        if (isCouched) {
          this.sound.playLanceImpact();
          this.triggerHitStop(0.044);
          this.addTrauma(0.55);
          const impactPos = enemy.position.clone().add(new THREE.Vector3(0, 1.4, 0));
          this.effects.spawnSparks(impactPos, 16, true);
          this.effects.spawnShockwave(enemy.position, 4.8, 0xffae38);
          this.effects.spawnFloatingText(impactPos, '+220 COUCHED LANCE!', 'lance');
        } else {
          this.sound.playSwordHit(false);
          this.addTrauma(0.2);
          this.effects.spawnFloatingText(
            enemy.position.clone().add(new THREE.Vector3(0, 1.8, 0)),
            'TRAMPLED!',
            'crit'
          );
        }
      }
    }
  }

  _updateOnFootLocomotion(dt, time, colliders) {
    if (this.dodgeTimer > 0) {
      this.dodgeTimer -= dt;
      this.speed = 12.2;
      this.position.x += this.dodgeDir.x * this.speed * dt;
      this.position.z += this.dodgeDir.z * this.speed * dt;
    } else {
      let forwardInput = (this.keys.forward ? 1 : 0) - (this.keys.backward ? 1 : 0) - this.joyVec.y;
      let steerInput = (this.keys.left ? 1 : 0) - (this.keys.right ? 1 : 0) - this.joyVec.x;
      forwardInput = Math.max(-1, Math.min(1, forwardInput));
      steerInput = Math.max(-1, Math.min(1, steerInput));

      // A/D rotates the knight's facing (and the bound camera behind them) so turning 360° is effortless
      if (Math.abs(steerInput) > 0.04) {
        this.yaw += steerInput * 2.85 * dt;
        if (!this.isCameraUnbound()) {
          let yawDiff = this.yaw - this.cameraYaw;
          while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
          while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
          if (Math.abs(yawDiff) < 0.5) {
            this.cameraYaw = this.yaw;
          }
        }
      }

      const maxFwdSpeed = this.isBlocking ? 3.4 : 6.6;
      const maxBackSpeed = this.isBlocking ? 2.6 : 4.5;
      const moveVel =
        forwardInput >= 0 ? forwardInput * maxFwdSpeed : forwardInput * maxBackSpeed;

      // Animate footwork when either moving forward/back or pivoting in place
      const targetAnimSpeed =
        Math.abs(moveVel) > 0.2 ? Math.abs(moveVel) : Math.abs(steerInput) > 0.05 ? 2.4 : 0;
      this.speed += (targetAnimSpeed - this.speed) * Math.min(1, 16 * dt);

      if (Math.abs(forwardInput) > 0.04) {
        const fwdX = Math.sin(this.yaw);
        const fwdZ = Math.cos(this.yaw);
        this.position.x += fwdX * moveVel * dt;
        this.position.z += fwdZ * moveVel * dt;
      }
    }

    this._constrainToWorldAndColliders(this.position, 0.65, colliders);
    this.position.y = getTerrainHeight(this.position.x, this.position.z);
    this._syncTransforms();
  }

  _updateUnmountedHorse(dt, time) {
    if (this.horseCalling) {
      const dx = this.position.x - this.horsePosition.x;
      const dz = this.position.z - this.horsePosition.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= 3.2) {
        this.horseCalling = false;
        this.toggleMount(true);
        return;
      }
      this.horseYaw = Math.atan2(dx, dz);
      const step = Math.min(dist, 13.5 * dt);
      this.horsePosition.x += (dx / dist) * step;
      this.horsePosition.z += (dz / dist) * step;
      this.horsePosition.y = getTerrainHeight(this.horsePosition.x, this.horsePosition.z);
      this.horse.root.position.copy(this.horsePosition);
      this.horse.root.rotation.set(0, this.horseYaw, 0);
    }
  }

  _updateCombatHits(dt, spatialGrid, battleAI) {
    // Shield Bash Hit Check
    if (this.shieldBashTimer > 0) {
      this.shieldBashTimer -= dt;
      if (!this.attackHitApplied && this.shieldBashTimer < 0.20 && spatialGrid && battleAI) {
        this.attackHitApplied = true;
        const fwdX = Math.sin(this.yaw);
        const fwdZ = Math.cos(this.yaw);
        const hitX = this.position.x + fwdX * 1.35;
        const hitZ = this.position.z + fwdZ * 1.35;
        const hits = spatialGrid.queryRadius(hitX, hitZ, 2.2, (u) => u.faction === 'saracen' && !u.dead);
        if (hits.length > 0) {
          const knockDir = new THREE.Vector3(fwdX, 0.25, fwdZ).normalize();
          for (const enemy of hits) {
            battleAI.damageUnit(enemy, 32, knockDir, true, false, 'player');
          }
          this.effects.spawnShockwave(this.position, 3.4, 0x68b8ff);
          this.effects.spawnFloatingText(
            this.position.clone().add(new THREE.Vector3(0, 2.0, 0)),
            'SHIELD BASH!',
            'parry'
          );
          this.addTrauma(0.25);
        }
      }
    }

    // Sword / Lance Melee Swing Hit Check
    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
      const progress = 1 - this.attackTimer / Math.max(0.01, this.attackDuration);
      if (!this.attackHitApplied && progress >= 0.36 && spatialGrid && battleAI) {
        this.attackHitApplied = true;

        const fwdX = Math.sin(this.yaw);
        const fwdZ = Math.cos(this.yaw);
        const reach = this.isMounted ? 2.4 : 1.75;
        const radius = this.isMounted ? 2.65 : 2.15;
        const hitX = this.position.x + fwdX * reach;
        const hitZ = this.position.z + fwdZ * reach;

        const isHeavyFinisher = this.attackType === 'cleave' || this.comboStep === 2;
        const baseDamage = this.isMounted
          ? isHeavyFinisher
            ? 95
            : 70
          : this.comboStep === 2
            ? 105
            : this.comboStep === 1
              ? 65
              : 50;

        const enemies = spatialGrid.queryRadius(hitX, hitZ, radius, (u) => u.faction === 'saracen' && !u.dead);
        if (enemies.length > 0) {
          const knockDir = new THREE.Vector3(fwdX, 0.2, fwdZ).normalize();
          for (let i = 0; i < enemies.length; i++) {
            const enemy = enemies[i];
            battleAI.damageUnit(enemy, baseDamage, knockDir, isHeavyFinisher, false, 'player');
          }

          const firstPos = enemies[0].position.clone().add(new THREE.Vector3(0, 1.5, 0));
          this.sound.playSwordHit(isHeavyFinisher);
          this.effects.spawnSparks(firstPos, isHeavyFinisher ? 14 : 8, isHeavyFinisher);
          this.effects.spawnHitBurst(firstPos, 7);

          if (isHeavyFinisher) {
            this.triggerHitStop(0.042);
            this.addTrauma(0.42);
            this.effects.spawnShockwave(enemies[0].position, 3.8, 0xffcf5c);
            this.effects.spawnFloatingText(firstPos, `+${baseDamage} CLEAVE!`, 'crit');
          } else {
            this.addTrauma(0.18);
            this.effects.spawnFloatingText(firstPos, `-${baseDamage}`, 'normal');
          }
        }
      }
    }
  }

  _constrainToWorldAndColliders(pos, radius, colliders) {
    // Keep within playable valley bounds
    const maxBound = 112;
    pos.x = Math.max(-maxBound, Math.min(maxBound, pos.x));
    pos.z = Math.max(-maxBound, Math.min(maxBound, pos.z));

    if (!colliders) return;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const minDist = (c.radius || 1.5) + radius;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDist * minDist && dSq > 0.0001) {
        const d = Math.sqrt(dSq);
        pos.x = c.x + (dx / d) * minDist;
        pos.z = c.z + (dz / d) * minDist;
      }
    }
  }

  _syncTransforms() {
    if (this.isMounted) {
      this.horse.root.position.copy(this.position);
      const nrm = getTerrainNormal(this.position.x, this.position.z);
      const fwdX = Math.sin(this.yaw);
      const fwdZ = Math.cos(this.yaw);
      const pitch = -Math.asin(Math.max(-0.45, Math.min(0.45, nrm.x * fwdX + nrm.z * fwdZ))) * 0.55;
      this.horse.root.rotation.set(pitch, this.yaw, 0);
      this.knight.root.position.set(0, 0, 0);
      this.knight.root.rotation.set(0, 0, 0);
    } else {
      this.knight.root.position.copy(this.position);
      this.knight.root.rotation.set(0, this.yaw, 0);
      this.horse.root.position.copy(this.horsePosition);
      this.horse.root.rotation.set(0, this.horseYaw, 0);
    }
  }

  /**
   * Updates third-person gameplay follow camera with trauma shake and speed FOV boost.
   * When bound (!this.isCameraUnbound()), locks cameraYaw behind character's this.yaw.
   */
  _updateCamera(dt, time) {
    if (!this.camera) return;

    // Bind camera directly behind character's back unless unbound via Right-Click/Middle-Click or [C]
    if (!this.isCameraUnbound()) {
      let yawDiff = this.yaw - this.cameraYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      if (Math.abs(yawDiff) < 0.25) {
        this.cameraYaw = this.yaw;
      } else {
        this.cameraYaw += yawDiff * Math.min(1, 14 * dt);
      }
      this.cameraPitch += (0.26 - this.cameraPitch) * Math.min(1, 6 * dt);
    }

    // Dynamic FOV during Couched Lance Gallop Charge
    const targetFov = this.lanceChargeTimer > 0 ? 63 : 55;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 6 * dt);
      this.camera.updateProjectionMatrix();
    }

    const dist = this.isMounted ? 6.6 : 5.0;
    const heightOffset = this.isMounted ? 2.35 : 1.75;

    this._camTarget.set(
      this.position.x,
      this.position.y + heightOffset,
      this.position.z
    );

    const horizDist = dist * Math.cos(this.cameraPitch);
    const vertDist = dist * Math.sin(this.cameraPitch);

    // Camera sits directly behind the player's look direction (-sin(cameraYaw), -cos(cameraYaw))
    const desiredX = this._camTarget.x - Math.sin(this.cameraYaw) * horizDist;
    const desiredZ = this._camTarget.z - Math.cos(this.cameraYaw) * horizDist;
    const minGroundY = getTerrainHeight(desiredX, desiredZ) + 0.85;
    const desiredY = Math.max(minGroundY, this._camTarget.y + vertDist);

    this._camPos.set(desiredX, desiredY, desiredZ);
    this.camera.position.lerp(this._camPos, Math.min(1, 22 * dt));

    // Trauma-based directional camera shake
    if (this.cameraTrauma > 0.001) {
      const shake = this.cameraTrauma * this.cameraTrauma;
      this.camera.position.x += Math.sin(time * 57) * 0.28 * shake;
      this.camera.position.y += Math.cos(time * 63) * 0.24 * shake;
      this.camera.position.z += Math.sin(time * 49) * 0.22 * shake;
      this.cameraTrauma = Math.max(0, this.cameraTrauma - 2.4 * dt);
    }

    // Look ahead of player's shoulders
    const lookAheadX = this._camTarget.x + Math.sin(this.cameraYaw) * 2.5;
    const lookAheadZ = this._camTarget.z + Math.cos(this.cameraYaw) * 2.5;
    this.camera.lookAt(lookAheadX, this._camTarget.y + 0.15, lookAheadZ);
  }
}
