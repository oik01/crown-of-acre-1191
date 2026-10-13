/**
 * UIManager.js
 * Manages all DOM overlays, live HUD telemetry, Companion Tactical Command Bar,
 * Mount/Dismount status, Army Morale tug-of-war bar, Chained Objective tracker,
 * localStorage High-Score Chronicle, and Mobile Virtual Joystick & Action Buttons.
 */
const HIGHSCORE_STORAGE_KEY = 'crown_of_acre_highscores_v1';

export class UIManager {
  constructor(player, battleAI, soundManager, callbacks = {}) {
    this.player = player;
    this.battleAI = battleAI;
    this.sound = soundManager;
    this.callbacks = callbacks;

    this.toastTimer = 0;
    this.inspectionMode = false;

    this._cacheDOM();
    this._bindEvents();
    this.renderHighScores();
  }

  _cacheDOM() {
    this.startScreen = document.getElementById('start-screen');
    this.pauseScreen = document.getElementById('pause-screen');
    this.gameoverScreen = document.getElementById('gameover-screen');
    this.hudContainer = document.getElementById('hud-container');

    // Start & Modal Buttons
    this.btnStartBattle = document.getElementById('btn-start-battle');
    this.btnResume = document.getElementById('btn-resume');
    this.btnRestartPause = document.getElementById('btn-restart-pause');
    this.btnRestartGameover = document.getElementById('btn-restart-gameover');
    this.highscoreList = document.getElementById('highscore-list');

    // HUD Top-Left Vitals & Stance
    this.barPlayerHp = document.getElementById('bar-player-hp');
    this.textPlayerHp = document.getElementById('text-player-hp');
    this.barPlayerStamina = document.getElementById('bar-player-stamina');
    this.textPlayerStamina = document.getElementById('text-player-stamina');
    this.barHorseHp = document.getElementById('bar-horse-hp');
    this.textHorseHp = document.getElementById('text-horse-hp');
    this.stanceBadge = document.getElementById('stance-badge');
    this.stanceHint = document.getElementById('stance-hint');

    // HUD Top-Center Morale & Objective
    this.barMoraleFill = document.getElementById('bar-morale-fill');
    this.textMoralePct = document.getElementById('text-morale-pct');
    this.objTitle = document.getElementById('objective-title');
    this.objDesc = document.getElementById('objective-desc');
    this.objHint = document.getElementById('objective-hint');
    this.barObjFill = document.getElementById('bar-objective-fill');
    this.textObjProgress = document.getElementById('text-objective-progress');

    // HUD Top-Right Score & Controls
    this.hudScore = document.getElementById('hud-score');
    this.hudKills = document.getElementById('hud-kills');
    this.hudComboBadge = document.getElementById('hud-combo-badge');
    this.btnCameraLock = document.getElementById('btn-camera-lock');
    this.btnMute = document.getElementById('btn-mute');
    this.btnPause = document.getElementById('btn-pause');

    // Center Tactical Toast
    this.tacticalToast = document.getElementById('tactical-toast');
    this.tacticalToastTitle = document.getElementById('tactical-toast-title');
    this.tacticalToastSub = document.getElementById('tactical-toast-sub');

    // Bottom Companion Command Bar & Mount Button
    this.cmdButtons = Array.from(document.querySelectorAll('.cmd-btn[data-cmd]'));
    this.btnMountToggle = document.getElementById('btn-mount-toggle');
    this.mountBtnLabel = document.getElementById('mount-btn-label');
    this.companionAliveCount = document.getElementById('companion-alive-count');

    // Game-Over Stats
    this.gameoverTitle = document.getElementById('gameover-title');
    this.gameoverSubtitle = document.getElementById('gameover-subtitle');
    this.statFinalScore = document.getElementById('stat-final-score');
    this.statFinalKills = document.getElementById('stat-final-kills');
    this.statFinalMorale = document.getElementById('stat-final-morale');
    this.statFinalObjectives = document.getElementById('stat-final-objectives');

    // Mobile Touch Controls
    this.joystickZone = document.getElementById('joystick-zone');
    this.joystickKnob = document.getElementById('joystick-knob');
    this.touchBtnAttack = document.getElementById('touch-btn-attack');
    this.touchBtnSpecial = document.getElementById('touch-btn-special');
    this.touchBtnBlock = document.getElementById('touch-btn-block');
    this.touchBtnMount = document.getElementById('touch-btn-mount');
  }

  _bindEvents() {
    if (this.btnStartBattle) {
      this.btnStartBattle.addEventListener('click', () => {
        if (this.callbacks.onStartGame) this.callbacks.onStartGame();
      });
    }
    if (this.btnResume) {
      this.btnResume.addEventListener('click', () => {
        if (this.callbacks.onResumeGame) this.callbacks.onResumeGame();
      });
    }
    if (this.btnRestartPause) {
      this.btnRestartPause.addEventListener('click', () => {
        if (this.callbacks.onRestartGame) this.callbacks.onRestartGame();
      });
    }
    if (this.btnRestartGameover) {
      this.btnRestartGameover.addEventListener('click', () => {
        if (this.callbacks.onRestartGame) this.callbacks.onRestartGame();
      });
    }
    if (this.btnPause) {
      this.btnPause.addEventListener('click', () => {
        if (this.callbacks.onTogglePause) this.callbacks.onTogglePause();
      });
    }
    if (this.btnCameraLock) {
      this.btnCameraLock.addEventListener('click', () => {
        if (this.player) {
          this.player.toggleCameraFreeLook();
        }
      });
    }
    if (this.player) {
      this.player.onCameraModeChanged = (isUnbound) => {
        if (this.btnCameraLock) {
          this.btnCameraLock.textContent = isUnbound
            ? '🔓 Cam: Free-Look [C]'
            : '🔒 Cam: Bound [RMB]';
        }
      };
    }
    if (this.btnMute) {
      this.btnMute.addEventListener('click', () => {
        const muted = this.sound.toggleMute();
        this.btnMute.textContent = muted ? '🔇 Muted' : '🔊 Audio';
      });
    }

    // Companion Tactical Order Buttons (1-4)
    for (const btn of this.cmdButtons) {
      btn.addEventListener('click', () => {
        const cmd = btn.getAttribute('data-cmd');
        if (cmd && this.callbacks.onIssueCommand) {
          this.callbacks.onIssueCommand(cmd);
        }
      });
    }

    // Mount / Dismount Button [E]
    if (this.btnMountToggle) {
      this.btnMountToggle.addEventListener('click', () => {
        if (this.player) this.player.toggleMount();
      });
    }

    // Mobile Touch Controls
    this._bindTouchControls();
  }

  _bindTouchControls() {
    if (this.joystickZone && this.joystickKnob) {
      let activeTouchId = null;
      const maxRadius = 42;

      const updateStick = (clientX, clientY) => {
        const rect = this.joystickZone.getBoundingClientRect();
        const cx = rect.left + rect.width * 0.5;
        const cy = rect.top + rect.height * 0.5;
        let dx = clientX - cx;
        let dy = clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > maxRadius) {
          dx = (dx / dist) * maxRadius;
          dy = (dy / dist) * maxRadius;
        }
        this.joystickKnob.style.transform = `translate(-50%, -50%) translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
        if (this.player) {
          this.player.joyVec.x = dx / maxRadius;
          this.player.joyVec.y = dy / maxRadius;
        }
      };

      const resetStick = () => {
        activeTouchId = null;
        this.joystickKnob.style.transform = 'translate(-50%, -50%)';
        if (this.player) {
          this.player.joyVec.x = 0;
          this.player.joyVec.y = 0;
        }
      };

      this.joystickZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        activeTouchId = t.identifier;
        updateStick(t.clientX, t.clientY);
      }, { passive: false });

      this.joystickZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeTouchId) {
            updateStick(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
            break;
          }
        }
      }, { passive: false });

      this.joystickZone.addEventListener('touchend', resetStick);
      this.joystickZone.addEventListener('touchcancel', resetStick);
    }

    if (this.touchBtnAttack) {
      this.touchBtnAttack.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.player) this.player.triggerPrimaryAttack();
      });
    }
    if (this.touchBtnSpecial) {
      this.touchBtnSpecial.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.player) this.player.triggerSpecialAction();
      });
    }
    if (this.touchBtnBlock) {
      this.touchBtnBlock.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.player) this.player.setBlocking(true);
      });
      this.touchBtnBlock.addEventListener('pointerup', (e) => {
        e.preventDefault();
        if (this.player) this.player.setBlocking(false);
      });
    }
    if (this.touchBtnMount) {
      this.touchBtnMount.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.player) this.player.toggleMount();
      });
    }
  }

  /**
   * Switches active UI state ('start' | 'playing' | 'paused' | 'gameover').
   */
  setGameState(state, isVictory = true) {
    if (this.inspectionMode) return;

    if (this.startScreen) this.startScreen.classList.toggle('hidden', state !== 'start');
    if (this.pauseScreen) this.pauseScreen.classList.toggle('hidden', state !== 'paused');
    if (this.gameoverScreen) this.gameoverScreen.classList.toggle('hidden', state !== 'gameover');
    if (this.hudContainer) this.hudContainer.classList.toggle('hidden', state !== 'playing');

    if (state !== 'playing') {
      if (this.tacticalToast) this.tacticalToast.classList.add('hidden');
      this.toastTimer = 0;
    }

    if (state === 'gameover') {
      this._populateGameoverModal(isVictory);
    }
  }

  /**
   * Hides all modal overlays when a debug inspection camera preset is active so the 3D canvas
   * is 100% unobstructed.
   */
  setInspectionMode(active) {
    this.inspectionMode = Boolean(active);
    const fl = document.getElementById('floating-labels-container');
    if (fl) fl.classList.toggle('hidden', this.inspectionMode);

    if (this.inspectionMode) {
      if (this.startScreen) this.startScreen.classList.add('hidden');
      if (this.pauseScreen) this.pauseScreen.classList.add('hidden');
      if (this.gameoverScreen) this.gameoverScreen.classList.add('hidden');
      if (this.hudContainer) this.hudContainer.classList.add('hidden');
      if (this.tacticalToast) this.tacticalToast.classList.add('hidden');
      this.toastTimer = 0;
    }
  }

  /**
   * Displays a central medieval heraldic toast banner when a Companion Tactical Order is issued.
   */
  showOrderToast(order) {
    if (!this.tacticalToast) return;

    const orderMeta = {
      follow: {
        title: '🎺 ORDER I: WEDGE FORMATION — FOLLOW!',
        sub: 'Elite Companions rallying in protective V-wedge around your warhorse',
      },
      charge: {
        title: '⚔️ ORDER II: COMPANIONS — CHARGE TARGET!',
        sub: 'Lances lowered! Retinue surging toward the planted Crusader Standard',
      },
      hold: {
        title: '🛡️ ORDER III: INTERLOCKING SHIELD WALL!',
        sub: 'Heater shields raised — holding ground with 70% damage reduction',
      },
      archers: {
        title: '🏹 ORDER IV: FLANK & HUNT ARCHERS!',
        sub: 'Companions storming the ridges to silence Saracen Composite Bowmen',
      },
    };

    const meta = orderMeta[order] || orderMeta.follow;
    if (this.tacticalToastTitle) this.tacticalToastTitle.textContent = meta.title;
    if (this.tacticalToastSub) this.tacticalToastSub.textContent = meta.sub;

    this.tacticalToast.classList.remove('hidden');
    this.toastTimer = 2.8;

    // Highlight active command button
    for (const btn of this.cmdButtons) {
      btn.classList.toggle('active', btn.getAttribute('data-cmd') === order);
    }
  }

  updateMountBadge(isMounted) {
    if (this.stanceBadge) {
      this.stanceBadge.textContent = isMounted ? '🐎 MOUNTED — DESTRIER' : '⚔️ ON FOOT — INFANTRY';
      this.stanceBadge.classList.toggle('stance-mounted', isMounted);
      this.stanceBadge.classList.toggle('stance-foot', !isMounted);
    }
    if (this.stanceHint) {
      this.stanceHint.textContent = isMounted
        ? '[A/D] Turn + Bound Cam • [Hold RMB / C] Free-Look • [SPACE] Lance Charge • [E] Dismount'
        : '[A/D] Turn + Bound Cam • [Hold RMB / C] Free-Look • [LMB] Combo • [SPACE] Dodge • [E] Mount';
    }
    if (this.mountBtnLabel) {
      this.mountBtnLabel.textContent = isMounted ? 'Dismount' : 'Mount Steed';
    }
  }

  /**
   * Updates all live HUD bars, objective progress, companion counters, and toast timers each frame.
   */
  update(dt) {
    if (!this.player || !this.battleAI) return;

    // 1. Toast Timer
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0 && this.tacticalToast) {
        this.tacticalToast.classList.add('hidden');
      }
    }

    // 2. Player & Warhorse Vitals
    const hpPct = Math.max(0, Math.min(100, (this.player.health / this.player.maxHealth) * 100));
    const stamPct = Math.max(0, Math.min(100, (this.player.stamina / this.player.maxStamina) * 100));
    const horsePct = Math.max(0, Math.min(100, (this.player.horseHealth / this.player.maxHorseHealth) * 100));

    if (this.barPlayerHp) this.barPlayerHp.style.width = `${hpPct.toFixed(1)}%`;
    if (this.textPlayerHp) this.textPlayerHp.textContent = `${Math.ceil(this.player.health)} / ${this.player.maxHealth}`;

    if (this.barPlayerStamina) this.barPlayerStamina.style.width = `${stamPct.toFixed(1)}%`;
    if (this.textPlayerStamina) {
      this.textPlayerStamina.textContent =
        this.player.lanceChargeTimer > 0 ? 'COUCHED CHARGE!' : `${Math.round(stamPct)}%`;
    }

    if (this.barHorseHp) this.barHorseHp.style.width = `${horsePct.toFixed(1)}%`;
    if (this.textHorseHp) {
      if (this.player.isMounted) {
        this.textHorseHp.textContent = `Destrier ${Math.round(horsePct)}%`;
      } else {
        const dist = Math.round(this.player.position.distanceTo(this.player.horsePosition));
        this.textHorseHp.textContent = dist <= 8 ? 'Ready [Press E]' : `${dist}m [E to Whistle]`;
      }
    }

    // 3. Army Morale Tug-of-War Bar
    const morale = Math.max(0, Math.min(100, this.battleAI.morale));
    if (this.barMoraleFill) this.barMoraleFill.style.width = `${morale.toFixed(1)}%`;
    if (this.textMoralePct) this.textMoralePct.textContent = `${Math.round(morale)}%`;

    // 4. Active Chained Objective
    const obj = this.battleAI.getCurrentObjectiveData();
    if (this.objTitle) this.objTitle.textContent = obj.title;
    if (this.objDesc) this.objDesc.textContent = obj.desc;
    if (this.objHint) this.objHint.textContent = obj.hint;
    if (this.barObjFill) this.barObjFill.style.width = `${(obj.progress * 100).toFixed(1)}%`;
    if (this.textObjProgress) this.textObjProgress.textContent = obj.progressText;

    // 5. Score, Kills & Combo Badge
    if (this.hudScore) this.hudScore.textContent = this.player.score.toLocaleString();
    if (this.hudKills) this.hudKills.textContent = `${this.player.kills}`;
    if (this.hudComboBadge) {
      if (this.player.comboMultiplier > 1) {
        this.hudComboBadge.classList.remove('hidden');
        this.hudComboBadge.textContent = `${this.player.comboMultiplier}x COMBO`;
      } else {
        this.hudComboBadge.classList.add('hidden');
      }
    }

    // 6. Companion Alive Counter & Active Order Highlight
    if (this.companionAliveCount) {
      let alive = 0;
      for (const c of this.battleAI.companions) {
        if (!c.dead) alive++;
      }
      this.companionAliveCount.textContent = `${alive} / ${this.battleAI.companions.length} Active`;
    }
    for (const btn of this.cmdButtons) {
      btn.classList.toggle('active', btn.getAttribute('data-cmd') === this.battleAI.companionOrder);
    }
  }

  _populateGameoverModal(isVictory) {
    if (this.gameoverTitle) {
      this.gameoverTitle.textContent = isVictory ? 'VICTORY AT ACRE!' : 'FALLEN IN BATTLE';
    }
    if (this.gameoverSubtitle) {
      this.gameoverSubtitle.textContent = isVictory
        ? 'The Saracen host is broken and the Crusader Standard flies above the northern ridge!'
        : 'Your retinue fought with valor in the Levantine valley. Ride forth once more!';
    }
    if (this.statFinalScore) this.statFinalScore.textContent = this.player.score.toLocaleString();
    if (this.statFinalKills) this.statFinalKills.textContent = `${this.player.kills}`;
    if (this.statFinalMorale) this.statFinalMorale.textContent = `${Math.round(this.battleAI.morale)}%`;
    if (this.statFinalObjectives) {
      this.statFinalObjectives.textContent = isVictory
        ? '5 / 5'
        : `${Math.min(5, this.battleAI.objectiveIndex)} / 5`;
    }

    this.saveHighScore(this.player.score, this.player.kills, isVictory);
    this.renderHighScores();
  }

  getHighScores() {
    try {
      const raw = localStorage.getItem(HIGHSCORE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore storage access errors
    }
    return [
      { title: 'King Richard Lionheart', score: 8450, kills: 28 },
      { title: 'Sir Guy of Lusignan', score: 6200, kills: 21 },
      { title: 'Grand Master Garnier', score: 4800, kills: 16 },
    ];
  }

  saveHighScore(score, kills, isVictory) {
    if (score <= 0) return;
    try {
      const scores = this.getHighScores();
      scores.push({
        title: isVictory ? 'Victorious Crusader' : 'Valiant Knight',
        score,
        kills,
      });
      scores.sort((a, b) => b.score - a.score);
      const top5 = scores.slice(0, 5);
      localStorage.setItem(HIGHSCORE_STORAGE_KEY, JSON.stringify(top5));
    } catch {
      // Ignore storage errors
    }
  }

  renderHighScores() {
    if (!this.highscoreList) return;
    const scores = this.getHighScores();
    this.highscoreList.innerHTML = scores
      .slice(0, 4)
      .map(
        (entry, idx) => `
        <div class="highscore-row">
          <span class="hs-rank">#${idx + 1}</span>
          <span class="hs-name">${entry.title}</span>
          <span class="hs-kills">${entry.kills} Slain</span>
          <span class="hs-score">${entry.score.toLocaleString()} pts</span>
        </div>
      `
      )
      .join('');
  }
}
