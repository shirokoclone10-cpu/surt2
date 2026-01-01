import { settings, getUIRoot, inputState, aimState } from '@/core/state.js';
import { findTeam, findBullet, findWeapon, inputCommands } from '@/utils/constants.js';
import { gameManager } from '@/core/state.js';
import { translations } from '@/core/obfuscatedNameTranslator.js';
import { ref_addEventListener } from '@/core/hook.js';
import {
  AimState,
  setAimState,
  getCurrentAimPosition,
  aimOverlays,
} from '@/core/aimController.js';
import { outerDocument, outer } from '@/core/outer.js';
import { v2, collisionHelpers, sameLayer, ballistics } from '@/utils/math.js';

const isBypassLayer = (layer) => layer === 2 || layer === 3;

const state = {
  focusedEnemy_: null,
  previousEnemies_: {},
  currentEnemy_: null,
  meleeLockEnemy_: null,
  velocityBuffer_: {},
  lastTargetScreenPos_: null,
  canAutoFire_: true,
  isCurrentEnemyShootable_: false,
  targetPriority_: {}, // Track target scores for better prioritization
  currentLootTarget_: null, // Track current loot being targeted
  isSwitchingToMelee_: false, // Track if we just queued melee switch
};

const MELEE_ENGAGE_DISTANCE = 5.5;
const MELEE_DETECTION_DISTANCE = 7.5; // Extended range for detection
const MELEE_LOCK_HYSTERESIS = 1.0; // Prevent rapid lock/unlock switching
const MELEE_PREDICTION_TIME = 0.15; // 150ms prediction for moving targets



const computeAimAngle = (point) => {
  if (!point) return 0;
  const centerX = outer.innerWidth / 2;
  const centerY = outer.innerHeight / 2;
  return Math.atan2(point.y - centerY, point.x - centerX);
};

const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

const getLocalLayer = (player) => {
  if (isBypassLayer(player.layer)) return player.layer;
  return player.layer;
};

const meetsLayerCriteria = (targetLayer, localLayer, isLocalOnBypass) => {
  if (isBypassLayer(targetLayer)) return true;
  return targetLayer === localLayer;
};

const BLOCKING_OBSTACLE_PATTERNS = [
  'metal_wall_',
  'brick_wall_',
  'concrete_wall_',
  'stone_wall_',
  'container_wall_',
  '_wall_int_',
  'bank_wall_',
  'barn_wall_',
  'cabin_wall_',
  'hut_wall_',
  'house_wall_',
  'mansion_wall_',
  'police_wall_',
  'shack_wall_',
  'outhouse_wall_',
  'teahouse_wall_',
  'warehouse_wall_',
  'silo_',
  'bollard_',
  'sandbags_',
  'hedgehog',
  'stone_01',
  'stone_02',
  'stone_03',
  'stone_04',
  'stone_05',
  'stone_06',
  'stone_07',
  'stone_08',
  'stone_09',
  'stone_0',
  'tree_',
  'glass_wall_',
  'locker_',
  'deposit_box_',
];

const NON_BLOCKING_OBSTACLE_PATTERNS = [
  'bush_',
  'brush_',
  'crate_',
  'barrel_',
  'refrigerator_',
  'control_panel_',
  'chest_',
  'case_',
  'oven_',
  'bed_',
  'bookshelf_',
  'couch_',
  'table_',
  'drawers_',
  'window',
  'toilet_',
  'pot_',
  'planter_',
  'pumpkin_',
  'potato_',
  'egg_',
  'woodpile_',
  'decal',

];

const isObstacleBlocking = (obstacle) => {
  if (obstacle.collidable === false) return false;

  const obstacleType = obstacle.type || '';

  if (obstacle.isWall === true) return true;

  if (obstacle.destructible === false) return true;

  for (const pattern of BLOCKING_OBSTACLE_PATTERNS) {
    if (obstacleType.includes(pattern)) return true;
  }

  for (const pattern of NON_BLOCKING_OBSTACLE_PATTERNS) {
    if (obstacleType.includes(pattern)) return false;
  }

  if (obstacle.health !== undefined && obstacle.health > 200) {
    return true;
  }

  return false;
};

const canCastToPlayer = (localPlayer, targetPlayer, weapon, bullet) => {
  if (!weapon || !bullet) {
    return true;
  }

  const game = gameManager.game;
  const idToObj = game?.[translations.objectCreator_]?.[translations.idToObj_];
  if (!idToObj) {
    return true;
  }

  const BULLET_HEIGHT = 0.25;
  const trueLayer = localPlayer.layer;

  const playerPos = localPlayer[translations.visualPos_];
  const targetPos = targetPlayer[translations.visualPos_];

  const dx = targetPos.x - playerPos.x;
  const dy = targetPos.y - playerPos.y;
  const aimAngle = Math.atan2(dy, dx);

  const dir = v2.create_(Math.cos(aimAngle), Math.sin(aimAngle));

  const baseSpread = (weapon.shotSpread || 0) * (Math.PI / 180);
  const generousSpread = baseSpread * 1.5;

  const maxDistance = Math.hypot(dx, dy);

  // Improved: Adaptive ray count based on spread and distance
  const rayCount = Math.max(
    Math.min(30, weapon.shotSpread ? Math.ceil((weapon.shotSpread || 0) * 2) : 15),
    Math.ceil(maxDistance / 50)
  );

  const allObstacles = Object.values(idToObj).filter((obj) => {
    if (!obj.collider) return false;
    if (obj.dead) return false;
    if (obj.height !== undefined && obj.height < BULLET_HEIGHT) return false;
    if (obj.layer !== undefined && !sameLayer(obj.layer, trueLayer)) return false;
    return true;
  });

  const blockingObstacles = allObstacles.filter(isObstacleBlocking);

  if (blockingObstacles.length === 0) {
    return true;
  }

  // Pre-calculate collision distances for all obstacles
  const collisionCache = new Map();
  for (const obstacle of blockingObstacles) {
    collisionCache.set(obstacle, new Map());
  }

  let unblocked = 0;
  for (let i = 0; i < rayCount; i++) {
    const t = rayCount === 1 ? 0.5 : i / (rayCount - 1);
    const rayAngle = aimAngle - generousSpread / 2 + generousSpread * t;
    const rayDir = v2.create_(Math.cos(rayAngle), Math.sin(rayAngle));

    const endPos = v2.add_(playerPos, v2.mul_(rayDir, maxDistance));
    let blocked = false;

    for (const obstacle of blockingObstacles) {
      let collision = collisionCache.get(obstacle).get(rayAngle);
      
      if (collision === undefined) {
        collision = collisionHelpers.intersectSegment_(obstacle.collider, playerPos, endPos);
        collisionCache.get(obstacle).set(rayAngle, collision);
      }
      
      if (collision) {
        const distToCollision = v2.length_(v2.sub_(collision.point, playerPos));
        // Improved: Check collision within target radius, not just before target
        const targetRadius = 0.75; // Approximate player collision radius
        if (distToCollision < maxDistance - targetRadius) {
          blocked = true;
          break;
        }
      }
    }

    if (!blocked) {
      unblocked++;
      // Early exit: If majority of rays pass through, target is shootable
      if (unblocked > rayCount * 0.4) {
        return true;
      }
    }
  }

  return unblocked > rayCount * 0.3; // At least 30% of rays must pass through
};

const queueInput = (command) => inputState.queuedInputs_.push(command);

let tickerAttached = false;

function getDistance(x1, y1, x2, y2) {
  return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

function calcAngle(playerPos, mePos) {
  const dx = mePos.x - playerPos.x;
  const dy = mePos.y - playerPos.y;

  return Math.atan2(dy, dx);
}

function predictPosition(enemy, currentPlayer) {
  if (!enemy || !currentPlayer) return null;

  const enemyPos = enemy[translations.visualPos_];
  const currentPlayerPos = currentPlayer[translations.visualPos_];
  
  // Store position history for velocity calculation
  const enemyId = enemy.__id;
  const history = state.previousEnemies_[enemyId] ?? (state.previousEnemies_[enemyId] = []);
  const now = performance.now();
  
  history.push([now, { ...enemyPos }]);
  if (history.length > 20) history.shift();

  // Need at least 3 samples for proper velocity calculation
  if (history.length < 3) {
    return gameManager.game[translations.camera_][translations.pointToScreen_]({
      x: enemyPos.x,
      y: enemyPos.y,
    });
  }

  // Calculate velocity using older position samples (surviv-cheat posOldOld method)
  let velocityX = 0;
  let velocityY = 0;
  
  // Use position from 2-3 frames ago for stability
  const oldestIdx = Math.max(0, history.length - 3);
  const newestIdx = history.length - 1;
  const oldPos = history[oldestIdx][1];
  const newPos = history[newestIdx][1];
  const timeDiff = (history[newestIdx][0] - history[oldestIdx][0]) / 1000; // Convert to seconds
  
  if (timeDiff > 0.001) { // Avoid division by very small numbers
    velocityX = (newPos.x - oldPos.x) / timeDiff;
    velocityY = (newPos.y - oldPos.y) / timeDiff;
  }

  // Clamp velocity to reasonable range
  const velMag = Math.hypot(velocityX, velocityY);
  if (velMag > 2000) {
    const scale = 2000 / velMag;
    velocityX *= scale;
    velocityY *= scale;
  }

  // Get weapon and bullet information
  const weapon = findWeapon(currentPlayer);
  const bullet = findBullet(weapon);
  const bulletSpeed = bullet?.speed || 1000;

  // Use quadratic formula approach from surviv-cheat for more accurate prediction
  // This solves: when will the bullet collide with the moving enemy?
  const userX = currentPlayerPos.x;
  const userY = currentPlayerPos.y;
  const enemyDirX = velocityX;
  const enemyDirY = velocityY;
  const diffX = enemyPos.x - userX;
  const diffY = enemyPos.y - userY;

  // Quadratic equation coefficients: at² + bt + c = 0
  // Where t is the time when bullet and enemy collide
  const a = enemyDirX * enemyDirX + enemyDirY * enemyDirY - bulletSpeed * bulletSpeed;
  const b = diffX * enemyDirX + diffY * enemyDirY;
  const c = diffX * diffX + diffY * diffY;
  
  // Discriminant check
  let t = 0;
  const discriminant = b * b - a * c;
  
  if (a !== 0 && discriminant >= 0) {
    // Solve quadratic formula: take the positive root
    const sqrtDiscriminant = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDiscriminant) / a;
    const t2 = (-b + sqrtDiscriminant) / a;
    
    // Use the smallest positive time value
    t = t1 > 0 ? (t2 > 0 ? Math.min(t1, t2) : t1) : (t2 > 0 ? t2 : 0);
  } else if (a === 0 && b !== 0) {
    // Linear case (enemy velocity == bullet speed)
    t = -c / (2 * b);
  }

  // Clamp to reasonable prediction time
  t = Math.max(0, Math.min(t, 2.0));

  // Calculate predicted position with optional prediction level smoothing
  const predictionLevel = settings.aimbot_.predictionLevel_ ?? 1.0;
  const predictedPos = {
    x: enemyPos.x + velocityX * t * predictionLevel,
    y: enemyPos.y + velocityY * t * predictionLevel,
  };

  return gameManager.game[translations.camera_][translations.pointToScreen_](predictedPos);
}

function findTarget(players, me) {
  const meTeam = findTeam(me);
  const isLocalOnBypassLayer = isBypassLayer(me.layer);
  const localLayer = getLocalLayer(me);
  let bestTarget = null;
  let bestScore = -Infinity;
  const fovRadiusSquared = settings.aimbot_.fov_ ** 2;
  const currentTime = performance.now();

  for (const player of players) {
    if (!player.active) continue;
    if (player[translations.netData_][translations.dead_]) continue;
    if (!settings.aimbot_.targetKnocked_ && player.downed) continue;
    if (me.__id === player.__id) continue;
    if (!meetsLayerCriteria(player.layer, localLayer, isLocalOnBypassLayer)) continue;
    if (findTeam(player) === meTeam && !settings.aimbot_.aimAllies_) continue;

    const screenPos = gameManager.game[translations.camera_][translations.pointToScreen_]({
      x: player[translations.visualPos_].x,
      y: player[translations.visualPos_].y,
    });

    const distance = getDistance(
      screenPos.x,
      screenPos.y,
      gameManager.game[translations.input_].mousePos._x,
      gameManager.game[translations.input_].mousePos._y
    );

    if (distance > fovRadiusSquared) continue;

    // Advanced target scoring system:
    // 1. Distance factor: Exponential decay (closer targets score higher)
    // 2. Continuity factor: Weak preference for current target (prevents jitter)
    // 3. Shootability: Can we hit them through walls?
    
    const screenDistance = Math.sqrt(distance);
    
    // Distance is PRIMARY factor - exponential decay (closer = much better)
    const distanceFactor = Math.exp(-screenDistance / 120); // Slightly tighter focus
    
    // Weak continuity bonus to prevent target switching jitter
    const isCurrent = player === state.currentEnemy_;
    const continuityBonus = isCurrent ? 0.02 : 0;
    
    // Small bonus for shootable targets (helps when multiple targets at same distance)
    const weapon = findWeapon(me);
    const bullet = findBullet(weapon);
    const isShootable = !settings.aimbot_.wallcheck_ || canCastToPlayer(me, player, weapon, bullet) ? 0.03 : 0;
    
    // Simple final score
    const score = distanceFactor + continuityBonus + isShootable;

    if (score > bestScore) {
      bestScore = score;
      bestTarget = player;
    }
  }

  return bestTarget;
}

function findClosestTarget(players, me) {
  const meTeam = findTeam(me);
  const isLocalOnBypassLayer = isBypassLayer(me.layer);
  const localLayer = getLocalLayer(me);
  let enemy = null;
  let minDistance = Infinity;

  for (const player of players) {
    if (!player.active) continue;
    if (player[translations.netData_][translations.dead_]) continue;
    if (!settings.aimbot_.targetKnocked_ && player.downed) continue;
    if (me.__id === player.__id) continue;
    if (!meetsLayerCriteria(player.layer, localLayer, isLocalOnBypassLayer)) continue;
    
    // Skip teammates unless melee attackAllies or aimbot aimAllies is enabled
    if (findTeam(player) === meTeam && !(settings.meleeLock_.attackAllies_ || settings.aimbot_.aimAllies_)) continue;

    const mePos = me[translations.visualPos_];
    const playerPos = player[translations.visualPos_];
    const distance = getDistance(mePos.x, mePos.y, playerPos.x, playerPos.y);

    if (distance < minDistance) {
      minDistance = distance;
      enemy = player;
    }
  }

  return enemy;
}

function isLootTargetable(lootObject) {
  // Check if object is a valid loot item to target
  if (!lootObject || lootObject.dead) return false;
  if (!lootObject.collider) return false;
  if (lootObject.layer === undefined) return false;
  
  const objectType = lootObject.type || '';
  
  // List of loot items we can shoot
  const LOOT_PATTERNS = [
    'crate_',
    'chest_',
    'barrel_',
    'bookshelf_',
    'drawers_',
    'locker_',
    'deposit_box_',
    'refrigerator_',
    'control_panel_',
    'case_',
    'oven_',
    'bed_',
    'couch_',
    'table_',
    'window',
    'pot_',
    'planter_',
  ];
  
  return LOOT_PATTERNS.some(pattern => objectType.includes(pattern));
}

function findMeleeLootTarget(me) {
  // Find closest destructible loot object for melee targeting
  if (!settings.meleeLock_.enabled_) return null;
  
  const game = gameManager.game;
  const idToObj = game?.[translations.objectCreator_]?.[translations.idToObj_];
  if (!idToObj) return null;
  
  const mePos = me[translations.visualPos_];
  const isLocalOnBypassLayer = isBypassLayer(me.layer);
  const localLayer = getLocalLayer(me);
  const meleeLockDistance = MELEE_ENGAGE_DISTANCE + MELEE_LOCK_HYSTERESIS;
  
  let bestLoot = null;
  let bestDistance = Infinity;
  
  for (const obj of Object.values(idToObj)) {
    if (!isLootTargetable(obj)) continue;
    
    // Check layer compatibility
    if (obj.layer !== undefined && !meetsLayerCriteria(obj.layer, localLayer, isLocalOnBypassLayer)) {
      continue;
    }
    
    const objPos = obj[translations.visualPos_];
    if (!objPos) continue;
    
    // Calculate distance in game space
    const distance = Math.hypot(mePos.x - objPos.x, mePos.y - objPos.y);
    
    // Only consider objects within melee range
    if (distance > meleeLockDistance) continue;
    
    if (distance < bestDistance) {
      bestDistance = distance;
      bestLoot = obj;
    }
  }
  
  return bestLoot;
}

function findLootTarget(me) {
  if (!settings.aimbot_.enabled_) return null;
  
  const game = gameManager.game;
  const idToObj = game?.[translations.objectCreator_]?.[translations.idToObj_];
  if (!idToObj) return null;
  
  const mePos = me[translations.visualPos_];
  const isLocalOnBypassLayer = isBypassLayer(me.layer);
  const localLayer = getLocalLayer(me);
  const fovRadiusSquared = settings.aimbot_.fov_ ** 2;
  
  let bestLoot = null;
  let bestScore = -Infinity;
  
  for (const obj of Object.values(idToObj)) {
    if (!isLootTargetable(obj)) continue;
    
    // Check layer compatibility
    if (obj.layer !== undefined && !meetsLayerCriteria(obj.layer, localLayer, isLocalOnBypassLayer)) {
      continue;
    }
    
    const objPos = obj[translations.visualPos_];
    if (!objPos) continue;
    
    // Get screen position
    const screenPos = gameManager.game[translations.camera_][translations.pointToScreen_]({
      x: objPos.x,
      y: objPos.y,
    });
    
    const distance = getDistance(
      screenPos.x,
      screenPos.y,
      gameManager.game[translations.input_].mousePos._x,
      gameManager.game[translations.input_].mousePos._y
    );
    
    // Must be within FOV
    if (distance > fovRadiusSquared) continue;
    
    // Calculate distance in game space
    const gameDist = getDistance(mePos.x, mePos.y, objPos.x, objPos.y);
    const screenDistance = Math.sqrt(distance);
    
    // Simple scoring: prefer closer loot items
    const score = -screenDistance + (gameDist < 100 ? 50 : 0); // Boost nearby items
    
    if (score > bestScore) {
      bestScore = score;
      bestLoot = obj;
    }
  }
  
  return bestLoot;
}
function isTargetingAlly(me) {
  if (!state.currentEnemy_ || !me) return false;
  const meTeam = findTeam(me);
  const targetTeam = findTeam(state.currentEnemy_);
  return meTeam === targetTeam;
}

function aimbotTicker() {
  try {
    const game = gameManager.game;
    if (
      !game.initialized ||
      !(settings.aimbot_.enabled_ || settings.meleeLock_.enabled_) ||
      game[translations.uiManager_].spectating
    ) {
      setAimState(new AimState('idle'));
      state.lastTargetScreenPos_ = null;
      return;
    }

    const players = game[translations.playerBarn_].playerPool[translations.pool_];
    const me = game[translations.activePlayer_];
    const isLocalOnBypassLayer = isBypassLayer(me.layer);
    let aimUpdated = false;
    let dotTargetPos = null;
    let previewTargetPos = null;
    let isDotTargetShootable = false;

    try {
      const currentWeaponIndex =
        game[translations.activePlayer_][translations.localData_][translations.curWeapIdx_];
      const isMeleeEquipped = currentWeaponIndex === 2;
      const isGrenadeEquipped = currentWeaponIndex === 3;
      const isAiming = game[translations.inputBinds_].isBindDown(inputCommands.Fire_);
      
      // Detect grenade cooking - grenade equipped and fire button held
      const isGrenadeCooking = isGrenadeEquipped && isAiming;
      
      // In automatic mode, check if there's an enemy nearby to trigger aiming
      const hasEnemyNearby = state.currentEnemy_ && 
        state.currentEnemy_.active && 
        !state.currentEnemy_[translations.netData_][translations.dead_];
      const shouldAim = isAiming || (settings.aimbot_.automatic_ && hasEnemyNearby);
      
      // Improved: In blatant mode, melee lock activates without needing to aim
      // Can be active even if switching to melee (will engage once equipped)
      const wantsMeleeLock = settings.meleeLock_.enabled_ && 
        (settings.aimbot_.automatic_ || isAiming);

      let meleeEnemy = state.meleeLockEnemy_;
      if (wantsMeleeLock) {
        // Check if current target is still valid
        let targetStillValid = false;
        if (meleeEnemy) {
          // For player targets, check active and dead status
          if (meleeEnemy.active !== undefined) {
            targetStillValid = meleeEnemy.active && !meleeEnemy[translations.netData_]?.[translations.dead_];
          } else {
            // For loot objects, just check if they exist and aren't dead
            targetStillValid = !meleeEnemy.dead;
          }
        }
        
        if (!targetStillValid) {
          // Try to find closest enemy first
          meleeEnemy = findClosestTarget(players, me);
          
          // If no enemies found, try to find closest loot object
          if (!meleeEnemy) {
            const lootTarget = findMeleeLootTarget(me);
            if (lootTarget) {
              meleeEnemy = lootTarget;
            }
          }
          
          state.meleeLockEnemy_ = meleeEnemy;
        }
      } else {
        meleeEnemy = null;
        state.meleeLockEnemy_ = null;
      }

      let distanceToMeleeEnemy = Infinity;
      let predictedMeleePos = null;
      let isMeleeLootTarget = false;
      
      if (meleeEnemy) {
        const mePos = me[translations.visualPos_];
        const enemyPos = meleeEnemy[translations.visualPos_];
        
        // Calculate base distance
        distanceToMeleeEnemy = Math.hypot(mePos.x - enemyPos.x, mePos.y - enemyPos.y);
        
        // Check if this is a loot object vs a player
        // Players have 'active' property, loot objects don't
        isMeleeLootTarget = meleeEnemy.active === undefined;
        
        // Simple velocity prediction for moving targets (players only, not loot)
        if (!isMeleeLootTarget) {
          const playerId = meleeEnemy.__id;
          if (state.previousEnemies_[playerId]?.lastVelocity_) {
            const vel = state.previousEnemies_[playerId].lastVelocity_;
            
            // For melee: simple time to reach estimate
            const timeToReach = Math.max(0.05, distanceToMeleeEnemy / 150);
            
            // Predict where enemy will be with simple linear motion
            const predictedX = enemyPos.x + vel.x * timeToReach;
            const predictedY = enemyPos.y + vel.y * timeToReach;
            
            predictedMeleePos = { x: predictedX, y: predictedY };
          }
        }
      }

      // Improved: Extended detection range + hysteresis for smoother engagement
      const meleeTargetInRange = distanceToMeleeEnemy <= MELEE_ENGAGE_DISTANCE + MELEE_LOCK_HYSTERESIS;
      const meleeTargetDetected = distanceToMeleeEnemy <= MELEE_DETECTION_DISTANCE;
      
      // In blatant mode with auto melee, extend detection range significantly
      // This allows auto-switch to happen from further away
      const blatantMeleeDistance = MELEE_DETECTION_DISTANCE * 1.5; // ~11 units instead of 7.5
      const isBlatantMeleeRange = settings.aimbot_.blatant_ && 
        settings.meleeLock_.autoMelee_ && 
        distanceToMeleeEnemy <= blatantMeleeDistance;

      // Auto-switch to melee if enabled and target in range
      if (
        wantsMeleeLock &&
        settings.meleeLock_.autoMelee_ &&
        !isMeleeEquipped &&
        (meleeTargetInRange || isBlatantMeleeRange) &&
        meleeEnemy
      ) {
        queueInput(inputCommands.EquipMelee_);
        state.isSwitchingToMelee_ = true; // Mark that we're switching to melee
      }

      // Reset flag if we already have melee equipped or target is out of range
      if (isMeleeEquipped || (!meleeTargetInRange && !isBlatantMeleeRange)) {
        state.isSwitchingToMelee_ = false;
      }

      // Melee lock is active if: wants melee, has enemy/loot in range, target is valid
      // Also allow engagement if we just queued melee switch and are waiting for it to complete
      const meleeLockActive = wantsMeleeLock && (meleeTargetInRange || isBlatantMeleeRange) && meleeEnemy && 
        (isMeleeEquipped || state.isSwitchingToMelee_);

      if (meleeLockActive) {
        const mePos = me[translations.visualPos_];
        const enemyPos = meleeEnemy[translations.visualPos_];
        
        // Use predicted position if available, otherwise use current position
        const targetPos = predictedMeleePos || enemyPos;

        const weapon = findWeapon(me);
        const bullet = findBullet(weapon);
        
        // Loot objects don't need wallcheck - they're always shootable
        // For enemies, check wallcheck setting
        let isMeleeTargetShootable = isMeleeLootTarget;
        if (!isMeleeTargetShootable) {
          isMeleeTargetShootable = !settings.aimbot_.wallcheck_ || canCastToPlayer(me, meleeEnemy, weapon, bullet);
        }

        if (isMeleeTargetShootable) {
          // Improved: Better movement calculation with predicted position
          const moveAngle = calcAngle(targetPos, mePos) + Math.PI;
          const moveDir = {
            touchMoveActive: true,
            touchMoveLen: 255,
            x: Math.cos(moveAngle),
            y: Math.sin(moveAngle),
          };

          const screenPos = game[translations.camera_][translations.pointToScreen_]({
            x: targetPos.x,
            y: targetPos.y,
          });
          
          // AutoAttack (surviv-cheat style): Auto-fire melee when in range
          // Fire continuously when melee equipped and in engage distance
          if (settings.meleeLock_.autoAttack_ && isMeleeEquipped && distanceToMeleeEnemy < MELEE_ENGAGE_DISTANCE) {
            // Simulate continuous fire for melee
            inputState.queuedInputs_.push(inputCommands.Fire_);
          }
          
          setAimState(new AimState('meleeLock', { x: screenPos.x, y: screenPos.y }, moveDir, true));
          aimUpdated = true;
          aimOverlays.hideAll();
          state.lastTargetScreenPos_ = null;
          return;
        }
      }

      // Improved: More gradual target loss with detection range
      if (wantsMeleeLock && !meleeTargetDetected) {
        state.meleeLockEnemy_ = null;
      }

      // Allow aiming/melee lock while cooking grenade, but disable if grenade equipped without cooking
      if (!settings.aimbot_.enabled_ || isMeleeEquipped || (isGrenadeEquipped && !isGrenadeCooking)) {
        setAimState(new AimState('idle'));
        aimOverlays.hideAll();
        state.lastTargetScreenPos_ = null;
        return;
      }

      const canEngageAimbot = shouldAim;

      let enemy =
        state.focusedEnemy_?.active &&
          !state.focusedEnemy_[translations.netData_][translations.dead_]
          ? state.focusedEnemy_
          : null;

      if (enemy) {
        const localLayer = getLocalLayer(me);
        if (!meetsLayerCriteria(enemy.layer, localLayer, isLocalOnBypassLayer)) {
          enemy = null;
          state.focusedEnemy_ = null;
          setAimState(new AimState('idle', null, null, true));
        }
      }

      if (!enemy) {
        if (state.focusedEnemy_) {
          state.focusedEnemy_ = null;
          setAimState(new AimState('idle', null, null, true));
        }
        enemy = findTarget(players, me);
        state.currentEnemy_ = enemy;
      }

      if (enemy) {
        const mePos = me[translations.visualPos_];
        const enemyPos = enemy[translations.visualPos_];
        const distanceToEnemy = Math.hypot(mePos.x - enemyPos.x, mePos.y - enemyPos.y);

        if (enemy !== state.currentEnemy_ && !state.focusedEnemy_) {
          state.currentEnemy_ = enemy;
          state.previousEnemies_[enemy.__id] = [];
          state.velocityBuffer_[enemy.__id] = [];
        }

        const predictedPos = predictPosition(enemy, me);
        if (!predictedPos) {
          setAimState(new AimState('idle'));
          aimOverlays.hideAll();
          state.lastTargetScreenPos_ = null;
          return;
        }

        previewTargetPos = { x: predictedPos.x, y: predictedPos.y };

        const weapon = findWeapon(me);
        const bullet = findBullet(weapon);
        const bulletRange = bullet?.distance || Infinity;

        // Check if target is within bullet range and not blocked by walls
        const isTargetShootable =
          distanceToEnemy <= bulletRange &&
          (!settings.aimbot_.wallcheck_ || canCastToPlayer(me, enemy, weapon, bullet));
        
        // Update state for AutoFire to check
        state.isCurrentEnemyShootable_ = isTargetShootable;
        
        // Calculate direction and target info for HUD
        const dx = enemyPos.x - mePos.x;
        const dy = enemyPos.y - mePos.y;
        const direction = Math.atan2(dy, dx);
        const targetName = enemy.nameText?._text || enemy.name || 'Unknown';
        
        const targetInfo = {
          direction,
          targetName,
          targetPos: enemyPos,
          distance: distanceToEnemy,
        };

        if (
          canEngageAimbot &&
          (settings.aimbot_.enabled_ || (settings.meleeLock_.enabled_ && distanceToEnemy <= 8))
        ) {
          if (isTargetShootable) {
            setAimState(
              new AimState('aimbot', { x: predictedPos.x, y: predictedPos.y }, null, true)
            );
            state.lastTargetScreenPos_ = { x: predictedPos.x, y: predictedPos.y };
            aimUpdated = true;
            const aimSnapshot = aimState.lastAimPos_;
            dotTargetPos = aimSnapshot
              ? { x: aimSnapshot.clientX, y: aimSnapshot.clientY }
              : { x: predictedPos.x, y: predictedPos.y };
            isDotTargetShootable = true;
          } else {
            dotTargetPos = { x: predictedPos.x, y: predictedPos.y };
            isDotTargetShootable = false;
          }
        } else {
          dotTargetPos = { x: predictedPos.x, y: predictedPos.y };
          isDotTargetShootable = isTargetShootable;
        }
      } else {
        // No enemy found, try to target loot items
        const lootTarget = findLootTarget(me);
        if (lootTarget) {
          state.currentLootTarget_ = lootTarget; // Track loot target for AutoSwitch
          
          const lootPos = lootTarget[translations.visualPos_];
          const lootScreenPos = gameManager.game[translations.camera_][translations.pointToScreen_]({
            x: lootPos.x,
            y: lootPos.y,
          });
          
          const distanceToLoot = Math.hypot(lootPos.x - mePos.x, lootPos.y - mePos.y);
          
          if (canEngageAimbot && settings.aimbot_.enabled_) {
            const weapon = findWeapon(me);
            const bullet = findBullet(weapon);
            const bulletRange = bullet?.distance || Infinity;
            
            // Check if loot is within bullet range
            const isLootShootable = distanceToLoot <= bulletRange &&
              (!settings.aimbot_.wallcheck_ || canCastToPlayer(me, lootTarget, weapon, bullet));
            
            if (isLootShootable) {
              setAimState(
                new AimState('aimbot', { x: lootScreenPos.x, y: lootScreenPos.y }, null, true)
              );
              state.lastTargetScreenPos_ = { x: lootScreenPos.x, y: lootScreenPos.y };
              aimUpdated = true;
              const aimSnapshot = aimState.lastAimPos_;
              dotTargetPos = aimSnapshot
                ? { x: aimSnapshot.clientX, y: aimSnapshot.clientY }
                : { x: lootScreenPos.x, y: lootScreenPos.y };
              isDotTargetShootable = true;
              previewTargetPos = { x: lootScreenPos.x, y: lootScreenPos.y };
            } else {
              dotTargetPos = { x: lootScreenPos.x, y: lootScreenPos.y };
              isDotTargetShootable = false;
              previewTargetPos = { x: lootScreenPos.x, y: lootScreenPos.y };
            }
          }
        } else {
          state.currentLootTarget_ = null;
        }
        
        if (!aimUpdated) {
          previewTargetPos = null;
          dotTargetPos = null;
        }
      }

      if (!aimUpdated) {
        setAimState(new AimState('idle'));
        state.lastTargetScreenPos_ = previewTargetPos
          ? { x: previewTargetPos.x, y: previewTargetPos.y }
          : null;
      }
      let displayPos = dotTargetPos;
      if (!displayPos && previewTargetPos) {
        displayPos = { x: previewTargetPos.x, y: previewTargetPos.y };
      }
      aimOverlays.updateDot(displayPos, isDotTargetShootable, !!state.focusedEnemy_);

    } catch (error) {
      aimOverlays.hideAll();
      setAimState(new AimState('idle', null, null, true));
      state.meleeLockEnemy_ = null;
      state.focusedEnemy_ = null;
      state.currentEnemy_ = null;
      state.lastTargetScreenPos_ = null;
    }
  } catch (error) {
    setAimState(new AimState({ mode: 'idle', immediate: true }));
    state.lastTargetScreenPos_ = null;
  }
}

export default function () {
  const startTicker = () => {
    const uiRoot = getUIRoot();
    if (aimOverlays.ensureInitialized(uiRoot)) {
      if (!tickerAttached) {
        gameManager.pixi._ticker.add(aimbotTicker);
        tickerAttached = true;
      }
    } else {
      requestAnimationFrame(startTicker);
    }
  };

  startTicker();
}

export function hasValidTarget() {
  return state.currentEnemy_ && 
    state.currentEnemy_.active && 
    !state.currentEnemy_[translations.netData_][translations.dead_];
}

export function getAimbotShootableState() {
  return state.isCurrentEnemyShootable_;
}

export function isTargetingLoot() {
  return state.currentLootTarget_ !== null;
}
