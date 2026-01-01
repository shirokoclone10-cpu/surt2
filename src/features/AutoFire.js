import { settings, gameManager, inputState, aimState } from '@/core/state.js';
import { ref_addEventListener } from '@/core/hook.js';
import { outer } from '@/core/outer';
import { translations } from '@/core/obfuscatedNameTranslator.js';
import { hasValidTarget, getAimbotShootableState } from '@/features/Aimbot.js';
import { inputCommands } from '@/utils/constants.js';

export let autoFireEnabled;

const PRIMARY_BUTTON = 0;
const MELEE_AUTOFIRE_DISTANCE = 5.5;
let isAutoFiringAutomatic = false;

const update = () => {
  autoFireEnabled = settings.autoFire_.enabled_;
};

const isAimbotAutomatic = () => {
  return settings.aimbot_.enabled_ && settings.aimbot_.automatic_;
};

const getClosestEnemyDistance = () => {
  try {
    const game = gameManager.game;
    if (!game || !game.initialized) return Infinity;
    
    const players = game[translations.playerManager_][translations.players_];
    const me = game[translations.activePlayer_];

    if (!players || !me) return Infinity;

    let closestDistance = Infinity;

    for (const player of players) {
      if (!player.active || me.__id === player.__id) continue;
      if (player[translations.netData_][translations.dead_]) continue;

      const mePos = me[translations.visualPos_];
      const enemyPos = player[translations.visualPos_];
      const distance = Math.hypot(mePos.x - enemyPos.x, mePos.y - enemyPos.y);
      
      if (distance < closestDistance) {
        closestDistance = distance;
      }
    }

    return closestDistance;
  } catch {
    return Infinity;
  }
};

const canFireWithCurrentWeapon = () => {
  try {
    const game = gameManager.game;
    if (!game || !game.initialized) return false;
    
    const activePlayer = game[translations.activePlayer_];
    if (!activePlayer) return false;
    
    const localData = activePlayer[translations.localData_];
    if (!localData) return false;
    
    const currentWeaponIndex = localData[translations.curWeapIdx_];
    // Can auto fire with primary (0) or secondary (1) weapons
    if (currentWeaponIndex === 0 || currentWeaponIndex === 1) return true;
    
    // Can only auto fire with melee (index 2) if:
    // 1. Melee lock is enabled
    // 2. Blatant mode is enabled
    // 3. Enemy is within melee range
    if (currentWeaponIndex === 2 && settings.meleeLock_.enabled_ && settings.aimbot_.blatant_) {
      return getClosestEnemyDistance() < MELEE_AUTOFIRE_DISTANCE;
    }
    
    // Index 3 = grenade - cannot auto fire with grenades
    return false;
  } catch {
    return false;
  }
};

const hasAimbotTarget = () => {
  // When automatic mode is enabled, only fire if aimbot has a valid target AND can shoot it
  // This prevents firing at enemies behind walls when wallcheck fails
  // This also checks bullet range
  if (isAimbotAutomatic()) {
    return hasValidTarget() && getAimbotShootableState();
  }
  
  try {
    const game = gameManager.game;
    if (!game || !game.initialized) return false;
    
    const activePlayer = game[translations.activePlayer_];
    if (!activePlayer) return false;
    
    // Check if there's a valid enemy to aim at
    // (This would be checked in Aimbot state, but we can check player list here)
    const players = game[translations.players_];
    if (!players || players.length === 0) return false;
    
    const me = game[translations.player_];
    if (!me || !me.alive_) return false;
    
    // Simple check: are there any other alive players?
    return players.some(p => p && p.active && !p[translations.netData_][translations.dead_] && p.__id !== me.__id);
  } catch {
    return false;
  }
};

const simulateMouseDown = () => {
  const mouseDownEvent = new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    view: outer,
    button: PRIMARY_BUTTON,
  });
  outer.dispatchEvent(mouseDownEvent);
};

const simulateMouseUp = () => {
  const mouseUpEvent = new MouseEvent('mouseup', {
    bubbles: true,
    cancelable: true,
    view: outer,
    button: PRIMARY_BUTTON,
  });
  outer.dispatchEvent(mouseUpEvent);
};

const handleMouseDown = (event) => {
  if (event.button !== PRIMARY_BUTTON) return;
  update();
};

const handleMouseUp = (event) => {
  if (event.button !== PRIMARY_BUTTON) return;
  autoFireEnabled = false;
  isAutoFiringAutomatic = false;
};

const autoFireTicker = () => {
  if (!settings.autoFire_.enabled_) {
    if (isAutoFiringAutomatic) {
      simulateMouseUp();
      isAutoFiringAutomatic = false;
    }
    return;
  }

  // Check if automatic mode is enabled and we have a valid target
  if (isAimbotAutomatic()) {
    const hasTarget = hasAimbotTarget();
    const canFire = canFireWithCurrentWeapon();
    
    if (hasTarget && canFire && !isAutoFiringAutomatic) {
      // Start firing
      simulateMouseDown();
      isAutoFiringAutomatic = true;
    } else if ((!hasTarget || !canFire) && isAutoFiringAutomatic) {
      // Stop firing
      simulateMouseUp();
      isAutoFiringAutomatic = false;
    }
  }
};

export default function () {
  update();
  Reflect.apply(ref_addEventListener, outer, ['mousedown', handleMouseDown]);
  Reflect.apply(ref_addEventListener, outer, ['mouseup', handleMouseUp]);
  
  // Add ticker for automatic firing
  setInterval(autoFireTicker, 16); // ~60fps
}
