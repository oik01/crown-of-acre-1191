import * as THREE from './vendor/three.module.js';
import { configureCinematicRenderer, updateAllWindCloth } from './graphics/PostProcessing.js';
import { createBattlefield, getTerrainHeight } from './world/Battlefield.js';
import { createPropsAndFortifications } from './world/PropsAndFortifications.js';
import { SpatialGrid } from './ai/SpatialGrid.js';
import { SoundManager } from './audio/SoundManager.js';
import { EffectsAndProjectiles } from './combat/EffectsAndProjectiles.js';
import { PlayerController } from './combat/PlayerController.js';
import { BattleAndCompanionAI } from './ai/BattleAndCompanionAI.js';
import { UIManager } from './ui/UIManager.js';
import { initDebugHarness } from './debug.js';

/**
 * main.js
 * Application bootstrap & 60 FPS simulation loop for "CROWN OF ACRE: 1191".
 */
function bootstrapGame() {
  const container = document.getElementById('canvas-container');
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.id = 'game-canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd8b88c);

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.15,
    380
  );

  // Configure ACES Filmic Tone Mapping, Soft Shadows & Metallic PMREM Environment
  configureCinematicRenderer(renderer, scene);

  // Build Sculpted Levantine Battlefield & Fortifications
  const battlefield = createBattlefield(scene, renderer);
  const props = createPropsAndFortifications(scene, getTerrainHeight);

  // Initialize Core Gameplay Systems
  const sound = new SoundManager();
  const spatialGrid = new SpatialGrid(6);
  const effects = new EffectsAndProjectiles(scene, sound);
  const player = new PlayerController(scene, camera, sound, effects);
  const battleAI = new BattleAndCompanionAI(scene, sound, effects, spatialGrid, props);

  const game = {
    scene,
    camera,
    renderer,
    battlefield,
    props,
    sound,
    spatialGrid,
    effects,
    player,
    battleAI,
    ui: null,
    state: 'start', // 'start' | 'playing' | 'paused' | 'gameover'
    activeCameraPreset: 'gameplay_follow',
    fps: 60,
    frameTimeMs: 16.6,
    resetFpsTracker: null,
  };

  // Initialize UI Manager & Wire Game State Transitions
  const ui = new UIManager(player, battleAI, sound, {
    onStartGame: () => {
      player.reset();
      battleAI.reset();
      effects.clearFloatingLabels();
      game.state = 'playing';
      game.activeCameraPreset = 'gameplay_follow';
      ui.setInspectionMode(false);
      ui.setGameState('playing');
      ui.updateMountBadge(player.isMounted);
      ui.showOrderToast(battleAI.companionOrder);
      sound.playHorn('charge');
      if (game.resetFpsTracker) game.resetFpsTracker();
    },
    onResumeGame: () => {
      if (game.state === 'paused') {
        game.state = 'playing';
        ui.setGameState('playing');
        if (game.resetFpsTracker) game.resetFpsTracker();
      }
    },
    onTogglePause: () => {
      if (game.state === 'playing') {
        game.state = 'paused';
        ui.setGameState('paused');
      } else if (game.state === 'paused') {
        game.state = 'playing';
        ui.setGameState('playing');
        if (game.resetFpsTracker) game.resetFpsTracker();
      }
    },
    onRestartGame: () => {
      player.reset();
      battleAI.reset();
      effects.clearFloatingLabels();
      game.state = 'playing';
      game.activeCameraPreset = 'gameplay_follow';
      ui.setInspectionMode(false);
      ui.setGameState('playing');
      ui.updateMountBadge(true);
      ui.showOrderToast('follow');
      sound.playHorn('follow');
      if (game.resetFpsTracker) game.resetFpsTracker();
    },
    onIssueCommand: (cmd) => {
      battleAI.issueCommand(cmd, player);
      ui.showOrderToast(cmd);
    },
  });
  game.ui = ui;

  // Wire Player & BattleAI Callbacks
  player.onCompanionCommand = (cmd) => {
    if (game.state !== 'playing') return;
    battleAI.issueCommand(cmd, player);
    ui.showOrderToast(cmd);
  };
  player.onTogglePause = () => {
    if (game.state === 'playing') {
      game.state = 'paused';
      ui.setGameState('paused');
    } else if (game.state === 'paused') {
      game.state = 'playing';
      ui.setGameState('playing');
      if (game.resetFpsTracker) game.resetFpsTracker();
    }
  };
  player.onMountChanged = (isMounted) => {
    ui.updateMountBadge(isMounted);
  };
  battleAI.onBattleVictory = () => {
    game.state = 'gameover';
    ui.setGameState('gameover', true);
  };

  // Expose Deterministic Debug Harness at window.__GAME_DEBUG__
  initDebugHarness(game);

  // Set Initial UI State
  ui.setGameState('start');
  ui.updateMountBadge(true);

  // Responsive Window Resize Handler
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── MAIN 60 FPS ANIMATION & SIMULATION LOOP ──
  let lastTime = performance.now();
  let elapsed = 0;
  let fpsAccum = 0;
  let fpsFrames = 0;

  game.resetFpsTracker = () => {
    fpsAccum = 0;
    fpsFrames = 0;
    game.fps = 60;
    game.frameTimeMs = 16.6;
    lastTime = performance.now();
  };

  const closeupPresets = new Set([
    'closeup_knight_front',
    'closeup_knight_side',
    'closeup_horse',
    'closeup_companions',
    'closeup_enemies',
  ]);

  function animate(now) {
    requestAnimationFrame(animate);

    const rawDt = (now - lastTime) * 0.001;
    lastTime = now;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));
    elapsed += dt;

    // Track rolling FPS & frameTimeMs
    fpsAccum += dt;
    fpsFrames++;
    if (fpsAccum >= 0.4) {
      game.fps = fpsFrames / fpsAccum;
      game.frameTimeMs = (fpsAccum / fpsFrames) * 1000;
      fpsAccum = 0;
      fpsFrames = 0;
    }

    const preset = game.activeCameraPreset;

    if (closeupPresets.has(preset)) {
      // During close-up entity inspection, keep staged poses still while animating cloth & braziers
      updateAllWindCloth(elapsed, 1.0);
      props.update(dt, elapsed);
      battlefield.update(dt, elapsed, player.position);
      renderer.render(scene, camera);
      return;
    }

    if (preset !== 'gameplay_follow') {
      // Panoramic / environmental preset: run background battle & arrows while locking camera to preset
      battleAI.update(dt, elapsed, player, camera);
      effects.update(dt, elapsed, camera, spatialGrid, player, battleAI);
      props.update(dt, elapsed);
      battlefield.update(dt, elapsed, player.position);
      updateAllWindCloth(elapsed, 1.0);
      renderer.render(scene, camera);
      return;
    }

    if (game.state === 'start') {
      // Live orbiting 3D diorama camera over the clashing armies on the Start Screen
      battleAI.update(dt * 0.65, elapsed, player, camera);
      effects.update(dt * 0.65, elapsed, camera, spatialGrid, player, battleAI);
      props.update(dt, elapsed);
      updateAllWindCloth(elapsed, 1.0);

      const orbitAngle = elapsed * 0.14;
      const cx = Math.sin(orbitAngle) * 28;
      const cz = 12 + Math.cos(orbitAngle) * 26;
      const cy = getTerrainHeight(cx, cz) + 11.5;
      camera.position.set(cx, cy, cz);
      camera.lookAt(0, 2.2, -8);
      battlefield.update(dt, elapsed, player.position);
    } else if (game.state === 'playing') {
      const hitStopped = player.update(dt, elapsed, spatialGrid, battleAI, props.colliders);
      if (!hitStopped) {
        battleAI.update(dt, elapsed, player, camera);
        effects.update(dt, elapsed, camera, spatialGrid, player, battleAI);
      }
      props.update(dt, elapsed);
      battlefield.update(dt, elapsed, player.position);
      updateAllWindCloth(elapsed, 1.0 + player.speed * 0.08);
      ui.update(dt);

      // Check player defeat condition
      if (player.dead) {
        game.state = 'gameover';
        sound.playVictoryFanfare(false);
        ui.setGameState('gameover', false);
      }
    } else {
      // Paused or Game Over: gently animate banners & braziers
      props.update(dt, elapsed);
      updateAllWindCloth(elapsed, 0.8);
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootstrapGame);
} else {
  bootstrapGame();
}
