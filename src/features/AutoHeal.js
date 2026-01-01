import { gameManager, settings, inputState } from '@/core/state.js';
import { translations } from '@/core/obfuscatedNameTranslator.js';
import { inputCommands } from '@/utils/constants.js';

let lastHealTime = Date.now();

// Item type constants matching surviv-cheat
const HEALING_ITEMS = {
  healthkit: {
    command: inputCommands.UseHealthKit_,
    minHealth: 30,
    cooldown: 6100, // 6.1 seconds
    type: 'health',
  },
  bandage: {
    command: inputCommands.UseBandage_,
    minHealth: 85, // 100 - 15
    cooldown: 3100, // 3.1 seconds
    type: 'health',
  },
  painkiller: {
    command: inputCommands.UsePainkiller_,
    minHealth: 50, // boost < 50
    cooldown: 6100, // 6.1 seconds
    type: 'boost',
    isBoost: true,
  },
  soda: {
    command: inputCommands.UseSoda_,
    minHealth: 75, // 100 - 25
    cooldown: 6100, // 6.1 seconds
    type: 'boost',
    isBoost: true,
  },
};

/**
 * Check if player has a specific item in inventory
 */
const playerHasItem = (items, itemName) => {
  if (!items || items.length === 0) return false;
  return items.some((item) => item && item.name === itemName);
};

/**
 * Queue input command (same as push to queuedInputs_)
 */
const queueInput = (command) => {
  inputState.queuedInputs_.push(command);
};

/**
 * Get healing items from inventory
 */
const getHealingItems = (player) => {
  if (!player) return [];
  
  try {
    const localData = player[translations.localData_];
    return localData?.[translations.inventory_] || [];
  } catch {
    return [];
  }
};

/**
 * Check if player can use healing item (not in action, not in combat with aimed enemy)
 */
const canUseHealingItem = (player, currentTarget) => {
  if (!player) return false;
  
  // Don't heal if actively shooting/aiming at enemy
  if (currentTarget && currentTarget.active) {
    return false;
  }
  
  // Check if player is in action (moving, etc.)
  // In surt we need to check if not in combat state
  // For now, simple check - we can use healing anytime if not aiming
  try {
    const netData = player[translations.netData_];
    const localData = player[translations.localData_];
    
    // Don't heal if downed or dead
    if (netData?.[translations.dead_] || player.downed) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
};

/**
 * Get current health and boost stats từ netData
 */
const getPlayerStats = () => {
  try {
    const game = gameManager.game;
    if (!game?.initialized) return { health: 100, boost: 100 };
    
    const player = game[translations.activePlayer_];
    if (!player) return { health: 100, boost: 100 };
    
    const netData = player[translations.netData_];
    if (!netData) return { health: 100, boost: 100 };
    
    // Sử dụng translations keys nếu đã được xác định
    let health = 100;
    let boost = 100;
    
    if (translations.health_) {
      health = Math.max(0, Math.min(100, netData[translations.health_] || 100));
    }
    
    if (translations.boost_) {
      boost = Math.max(0, Math.min(100, netData[translations.boost_] || 100));
    }
    
    return { health, boost };
  } catch (e) {
    if (DEV) console.error('getPlayerStats error:', e);
    return { health: 100, boost: 100 };
  }
};

/**
 * Main autoheal logic (surviv-cheat style)
 */
const autoHealTicker = () => {
  if (!settings.autoHeal_?.enabled_) {
    return;
  }

  try {
    const game = gameManager.game;
    if (!game || !game.initialized) return;

    const player = game[translations.activePlayer_];
    if (!player) return;

    // Don't heal if we have an aiming target (from aimbot)
    // We'd need to import from Aimbot, but for now simple check
    const stats = getPlayerStats(player);
    const items = getHealingItems(player);

    const now = Date.now();

    // Healthkit: heal when health < 30, cooldown 6.1s
    if (
      stats.health < HEALING_ITEMS.healthkit.minHealth &&
      playerHasItem(items, 'healthkit') &&
      canUseHealingItem(player, null) &&
      now - lastHealTime > HEALING_ITEMS.healthkit.cooldown
    ) {
      queueInput(inputCommands.Equip5_); // Item slot 5
      lastHealTime = now;
      return; // Only use one item per tick
    }

    // Bandage: heal when health < 85, cooldown 3.1s
    if (
      stats.health < HEALING_ITEMS.bandage.minHealth &&
      playerHasItem(items, 'bandage') &&
      canUseHealingItem(player, null) &&
      now - lastHealTime > HEALING_ITEMS.bandage.cooldown
    ) {
      queueInput(inputCommands.Equip4_); // Item slot 4
      lastHealTime = now;
      return;
    }

    // Painkiller: heal boost when < 50, cooldown 6.1s
    if (
      stats.boost < HEALING_ITEMS.painkiller.minHealth &&
      playerHasItem(items, 'painkiller') &&
      canUseHealingItem(player, null) &&
      now - lastHealTime > HEALING_ITEMS.painkiller.cooldown
    ) {
      queueInput(inputCommands.Equip0_); // Item slot 0
      lastHealTime = now;
      return;
    }

    // Soda: heal boost when < 75, cooldown 6.1s
    if (
      stats.boost < HEALING_ITEMS.soda.minHealth &&
      playerHasItem(items, 'soda') &&
      canUseHealingItem(player, null) &&
      now - lastHealTime > HEALING_ITEMS.soda.cooldown
    ) {
      queueInput(inputCommands.Equip7_); // Item slot 7
      lastHealTime = now;
      return;
    }
  } catch (e) {
    // Safety: don't break on error
    console.error('AutoHeal error:', e);
  }
};

export default function () {
  // Run autoheal ticker every 100ms
  setInterval(autoHealTicker, 100);
}
