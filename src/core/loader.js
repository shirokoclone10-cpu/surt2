import xray from '@/features/X-Ray.js';
import esp from '@/features/ESP.js';
import grenadeTimer from '@/features/GrenadeTimer.js';
import autoFire, { autoFireEnabled } from '@/features/AutoFire.js';
import autoHeal from '@/features/AutoHeal.js';
import aimbot, { hasValidTarget } from '@/features/Aimbot.js';
import mapHighlights from '@/features/MapHighlights.js';
import autoSwitch from '@/features/AutoSwitch.js';
import spinbot from '@/features/Spinbot.js';
import blurBackground from '@/features/BlurBackground.js';
import { translate, translations } from '@/core/obfuscatedNameTranslator.js';
import { hook } from '@/core/hook.js';
import { PIXI, inputCommands, packetTypes } from '@/utils/constants.js';
import { aimState, inputState, settings, gameManager, setGameManager } from '@/core/state.js';
import { initializeAimController, isAimInterpolating, getAimMode } from '@/core/aimController.js';
import initUI from '@/ui/init.jsx';
import { outer } from '@/core/outer.js';

function injectGame(oninject) {
  hook(outer.Function.prototype, 'call', {
    apply(f, th, args) {
      try {
        if (args[0]?.nameInput != null && args[0]?.game != null) {
          outer.Function.prototype.call = f;
          setGameManager(args[0]);
          oninject();
        }
      } catch { }
      return Reflect.apply(f, th, args);
    },
  });
}

const loadStaticPlugins = () => {
  autoFire();
  autoHeal();
  mapHighlights();
  blurBackground();
};

const loadPIXI = () => {
  PIXI.Container_ = gameManager.pixi.stage.constructor;
  PIXI.Graphics_ = gameManager.pixi.stage.children.find((child) => child.lineStyle)?.constructor;
};

let ranPlugins = false;

const loadPlugins = () => {
  if (!ranPlugins) {
    loadPIXI();
    initializeAimController();
    esp();
    grenadeTimer();
    aimbot();
    autoSwitch();
    spinbot();

    ranPlugins = true;
  }
  xray();
};

let emoteTypes = [];
let cachedMoveDir = { x: 0, y: 0 };

// Track weapon ammo state to detect reloading
const weaponAmmoState = {
  primary_: null,
  secondary_: null,
  lastCheckTime_: 0,
};

const isWeaponReloading = () => {
  try {
    const game = gameManager.game;
    const me = game?.[translations.player_];
    if (!me) return false;
    
    const currentWeaponIndex = me[translations.netData_]?.[translations.activeWeapon_];
    const weapons = me[translations.localData_]?.[translations.weapons_];
    if (!weapons || currentWeaponIndex === undefined) return false;
    
    const currentWeapon = weapons[currentWeaponIndex];
    if (!currentWeapon) return false;
    
    // Track ammo for primary (0) and secondary (1) weapons only
    const stateKey = currentWeaponIndex === 0 ? 'primary_' : 'secondary_';
    const previousAmmo = weaponAmmoState[stateKey];
    
    // If ammo just decreased, weapon is reloading
    if (previousAmmo !== null && previousAmmo > currentWeapon.ammo) {
      return true; // Still reloading
    }
    
    // Update state
    weaponAmmoState[stateKey] = currentWeapon.ammo;
    weaponAmmoState.lastCheckTime_ = performance.now();
    
    return false;
  } catch {
    return false;
  }
};

const findNetworkHandler = () =>
  Object.getOwnPropertyNames(gameManager.game.__proto__).find(
    (name) => typeof gameManager.game[name] === 'function' && gameManager.game[name].length === 3
  );

const applyAutoLootFlag = (packet) => {
  packet.isMobile = settings.autoLoot_.enabled_;
};

const flushQueuedInputs = (packet) => {
  for (const command of inputState.queuedInputs_) {
    packet.addInput(command);
  }
  inputState.queuedInputs_.length = 0;
};

const updateEmoteTypes = (loadout) => {
  if (!loadout?.emotes) return;
  for (let i = 0; i < 4; i += 1) {
    emoteTypes[i] = loadout.emotes[i];
  }
};

const applyAutoFire = (packet) => {
  if (!autoFireEnabled) {
    // Check if we're in automatic aimbot mode with a valid target
    const isAutomatic = settings.aimbot_.enabled_ && settings.aimbot_.automatic_;
    if (!isAutomatic || !hasValidTarget()) return;
    
    // Additional checks for automatic mode
    try {
      const game = gameManager.game;
      const me = game?.[translations.player_];
      
      // Don't fire if melee or grenade equipped
      if (!me) return;
      const currentWeaponIndex = me[translations.netData_]?.[translations.activeWeapon_];
      const isMeleeEquipped = currentWeaponIndex === 2;
      const isGrenadeEquipped = currentWeaponIndex === 3;
      
      if (isMeleeEquipped || isGrenadeEquipped) return;
      
      // Don't fire while weapon is reloading
      if (isWeaponReloading()) return;
    } catch {
      return;
    }
  }
  
  packet.shootStart = true;
  packet.shootHold = true;
};

const applyAimMovement = (packet) => {
  if (!aimState.aimTouchMoveDir_) return;

  packet.touchMoveActive = true;
  packet.touchMoveLen = true;
  packet.touchMoveDir.x = aimState.aimTouchMoveDir_.x;
  packet.touchMoveDir.y = aimState.aimTouchMoveDir_.y;
};

const suppressedShootState = {
  pendingStart_: false,
  pendingHold_: false,
  suppressedFireInput_: false,
  wasShootingLastFrame_: false,
  firstShotFrameCount_: 0,
};

const clearSuppressedShootState = () => {
  suppressedShootState.pendingStart_ = false;
  suppressedShootState.pendingHold_ = false;
  suppressedShootState.suppressedFireInput_ = false;
  suppressedShootState.firstShotFrameCount_ = 0;
};

const applyAimTransitionSafety = (packet) => {
  if (!packet) return;

  const aimMode = getAimMode();
  const isCurrentlyShooting =
    !!packet.shootStart ||
    !!packet.shootHold ||
    (Array.isArray(packet.inputs) && packet.inputs.includes(inputCommands.Fire_));

  if (
    isCurrentlyShooting &&
    !suppressedShootState.wasShootingLastFrame_ &&
    settings.aimbot_.enabled_
  ) {
    suppressedShootState.firstShotFrameCount_ = 3;
  }

  suppressedShootState.wasShootingLastFrame_ = isCurrentlyShooting;

  if (!isCurrentlyShooting) {
    suppressedShootState.firstShotFrameCount_ = 0;
  }

  const suppressFirstShot = suppressedShootState.firstShotFrameCount_ > 0;
  if (suppressFirstShot) {
    suppressedShootState.firstShotFrameCount_--;
  }

  const shouldSuppressShooting = (isAimInterpolating() && aimMode !== 'idle') || suppressFirstShot;

  if (!shouldSuppressShooting) {
    if (suppressedShootState.pendingStart_) {
      packet.shootStart = true;
      if (suppressedShootState.pendingHold_) {
        packet.shootHold = true;
        if (
          Array.isArray(packet.inputs) &&
          suppressedShootState.suppressedFireInput_ &&
          !packet.inputs.includes(inputCommands.Fire_)
        ) {
          packet.inputs.push(inputCommands.Fire_);
        }
      }
    }
    clearSuppressedShootState();
    return;
  }

  let fireCommandSuppressed = false;
  if (Array.isArray(packet.inputs)) {
    for (let i = packet.inputs.length - 1; i >= 0; i -= 1) {
      if (packet.inputs[i] === inputCommands.Fire_) {
        packet.inputs.splice(i, 1);
        fireCommandSuppressed = true;
      }
    }
  }

  const intendedStart = !!packet.shootStart;
  const intendedHold = !!packet.shootHold || fireCommandSuppressed;

  if (!intendedStart && !intendedHold) {
    return;
  }

  packet.shootStart = false;
  packet.shootHold = false;

  suppressedShootState.pendingStart_ =
    suppressedShootState.pendingStart_ || intendedStart || intendedHold;
  suppressedShootState.pendingHold_ = suppressedShootState.pendingHold_ || intendedHold;
  suppressedShootState.suppressedFireInput_ =
    suppressedShootState.suppressedFireInput_ || fireCommandSuppressed;
};

const setupInputOverride = () => {
  const networkHandler = findNetworkHandler();

  hook(gameManager.game, networkHandler, {
    apply(original, context, args) {
      const [type, payload] = args;

      if (type === packetTypes.Join_) {
        applyAutoLootFlag(payload);
      }

      if (type === packetTypes.Input_) {
        flushQueuedInputs(payload);
      }

      if (payload.loadout) {
        updateEmoteTypes(payload.loadout);
      }

      if (!payload.inputs) {
        return Reflect.apply(original, context, args);
      }

      applyAutoFire(payload);
      applyAimMovement(payload);
      applyAimTransitionSafety(payload);

      inputState.toMouseLen_ = payload.toMouseLen;

      return Reflect.apply(original, context, args);
    },
  });
};

const attach = () => {
  hook(gameManager.game, 'init', {
    apply(f, th, args) {
      const result = Reflect.apply(f, th, args);
      translate(gameManager).then(() => {
        loadPlugins();
        ranPlugins = true;
      });
      return result;
    },
  });
  setupInputOverride();
};

export const initialize = () => {
  try {
    const configKey = 'surviv_config';
    const configStr = outer.localStorage.getItem(configKey);
    if (configStr) {
      const config = JSON.parse(configStr);
      config.interpolation = true;
      config.localRotation = true;
      outer.localStorage.setItem(configKey, JSON.stringify(config));
    }
  } catch { }

  initUI();
  loadStaticPlugins();
  injectGame(attach);
};
