import { encryptDecrypt } from '@/utils/crypto.js';
import { initStore, write } from '@/utils/store.js';
import { outer } from '@/core/outer.js';

export const aimState = {
  lastAimPos_: null,
  aimTouchMoveDir_: null,
  aimTouchDistanceToEnemy_: null,
  reset() {
    this.lastAimPos_ = null;
    this.aimTouchMoveDir_ = null;
    this.aimTouchDistanceToEnemy_ = null;
  },
};

export const inputState = {
  queuedInputs_: [],
  toMouseLen_: 0,
};

export let gameManager;
export const setGameManager = (gm) => {
  gameManager = gm;
  if (DEV) {
    try {
      outer.gameManager = gm;
    } catch { }
  }
};

export const defaultSettings = {
  aimbot_: {
    enabled_: true,
    targetKnocked_: true,
    showDot_: true,
    wallcheck_: true,
    automatic_: false,
    autoSwitch_: false,
    aimAllies_: false,
  },
  meleeLock_: {
    enabled_: true,
    autoMelee_: false,
    autoAttack_: true,
    attackAllies_: false,
  },
  autoFire_: {
    enabled_: true,
  },
  autoHeal_: {
    enabled_: false,
  },
  xray_: {
    enabled_: true,
    smokeOpacity_: 50,
    darkerSmokes_: true,
    treeOpacity_: 50,
    removeCeilings_: true,
  },
  esp_: {
    visibleNametags_: true,
    enabled_: true,
    players_: true,
    grenades_: {
      explosions_: true,
      trajectory_: true,
    },
    flashlights_: {
      own_: true,
      others_: true,
      trajectory_: true,
    },
  },
  autoLoot_: {
    enabled_: true,
  },
  mapHighlights_: {
    enabled_: true,
    smallerTrees_: true,
  },
  blurBackground_: {
    enabled_: true,
  },
  autoSwitch_: {
    enabled_: true,
    useOneGun_: false,
  },
  spinbot_: {
    enabled_: false,
    speed_: 50,
    realistic_: true,
    spinAllDirections_: false,
    spinThreeDirections_: false,
    spinTwoDirections_: false,
  },

  keybinds_: {
    toggleMenu_: 'ShiftRight',
    toggleAimbot_: 'KeyB',
    toggleAutomatic_: 'KeyI',
    toggleSpinbot_: 'KeyO',
  },
  misc_: {
    discordNotifShown_: false,
  },
};

const settingsKeys = {
  aimbot_: {
    _k: '\t',
    enabled_: '𝅷',

    targetKnocked_: '',
    showDot_: '',
    wallcheck_: '',
    automatic_: '',
    aimAllies_: '󠄟',
  },
  meleeLock_: {
    _k: '󠁑',
    enabled_: '󠁧',
    autoMelee_: '󠁢',
    autoAttack_: '󠁤',
    attackAllies_: '󠁣',
  },
  autoFire_: {
    _k: '󠄸',
    enabled_: '󠄴',
  },
  autoHeal_: {
    _k: '󠅫',
    enabled_: '󠅬',
  },
  xray_: {
    _k: '󠅔',
    enabled_: '󠅑',
    smokeOpacity_: '󠅢',
    treeOpacity_: '󠅿',
    removeCeilings_: '󠆛',
    darkerSmokes_: '󠆸',
  },
  esp_: {
    _k: '󠇍',
    visibleNametags_: '󠇓',
    enabled_: '󠇥',
    players_: '󠇯',
    flashlights_: {
      _k: '󠇮',
      own_: '󠅬',
      others_: '󠅰',
      trajectory_: '󠅝',
    },
    grenades_: {
      _k: '󠅎',
      explosions_: '󠅋',
      trajectory_: '󠄼',
    },
  },
  mapHighlights_: {
    _k: '󠄩',
    enabled_: '󠄞',
    smallerTrees_: '󠄚',
  },
  blurBackground_: {
    _k: '󠄤',
    enabled_: '󠄥',
  },
  autoLoot_: {
    _k: '󠄏',
    enabled_: '󠄏󠄏',
  },
  autoSwitch_: {
    _k: '󠄎󠄎',
    enabled_: '󠄃',
    useOneGun_: '󠄃󠄃',
  },
  spinbot_: {
    _k: '󠄎󠄐',
    enabled_: '󠄃󠄍',
    speed_: '󠄃󠄎',
    realistic_: '󠄃󠄏',
    spinThreeDirections_: '󠄃󠄒',
    spinAllDirections_: '󠄃󠄑',
    spinTwoDirections_: '󠄃󠄓',
  },

  keybinds_: {
    _k: 'a',
    toggleMenu_: 'b',
    toggleAimbot_: 'c',
    toggleAutomatic_: 'e',
    toggleSpinbot_: 'f',
  },
  misc_: {
    _k: 'z',
    discordNotifShown_: 'z1',
  },
};

const createSettings = (keys, defaults) => {
  const store = {};
  const obj = {};

  const build = (k, d, storePath) => {
    const result = {};
    for (const prop in k) {
      if (prop === '_k') continue;
      const key = k[prop];
      const defaultVal = d?.[prop];
      if (typeof key === 'object' && key._k) {
        result[prop] = build(key, defaultVal, storePath + '.' + prop);
      } else {
        const fullPath = storePath + '.' + prop;
        if (typeof defaultVal === 'number') {
          store[fullPath] = defaultVal;
        } else if (typeof defaultVal === 'string') {
          store[fullPath] = defaultVal;
        } else {
          store[fullPath] = Boolean(defaultVal);
        }
        Object.defineProperty(result, prop, {
          get() {
            return store[fullPath];
          },
          set(v) {
            if (typeof store[fullPath] === 'number') {
              store[fullPath] = typeof v === 'number' ? v : 0;
            } else if (typeof store[fullPath] === 'string') {
              store[fullPath] = typeof v === 'string' ? v : '';
            } else {
              store[fullPath] = Boolean(v);
            }
          },
          enumerable: true,
        });
      }
    }
    return result;
  };

  for (const topKey in keys) {
    obj[topKey] = build(keys[topKey], defaults[topKey], topKey);
  }

  const serialize = () => {
    const serializeGroup = (k, prefix) => {
      const result = {};
      for (const prop in k) {
        if (prop === '_k') continue;
        const key = k[prop];
        if (typeof key === 'object' && key._k) {
          result[key._k] = serializeGroup(key, prefix + '.' + prop);
        } else {
          const fullPath = prefix + '.' + prop;
          result[key] = store[fullPath];
        }
      }
      return result;
    };

    const result = {};
    for (const topKey in keys) {
      result[keys[topKey]._k] = serializeGroup(keys[topKey], topKey);
    }
    return result;
  };

  const deserialize = (data) => {
    if (!data || typeof data !== 'object') return;

    const deserializeGroup = (k, d, prefix) => {
      if (!d || typeof d !== 'object') return;
      for (const prop in k) {
        if (prop === '_k') continue;
        const key = k[prop];
        if (typeof key === 'object' && key._k) {
          const nested = d[key._k];
          deserializeGroup(key, nested, prefix + '.' + prop);
        } else {
          const value = d[key];
          if (value !== undefined) {
            const fullPath = prefix + '.' + prop;
            if (typeof store[fullPath] === 'number') {
              store[fullPath] = typeof value === 'number' ? value : 0;
            } else if (typeof store[fullPath] === 'string') {
              store[fullPath] = typeof value === 'string' ? value : '';
            } else {
              store[fullPath] = Boolean(value);
            }
          }
        }
      }
    };

    for (const topKey in keys) {
      const topData = data[keys[topKey]._k];
      deserializeGroup(keys[topKey], topData, topKey);
    }
  };

  obj._serialize = serialize;
  obj._deserialize = deserialize;

  return obj;
};

export const settings = createSettings(settingsKeys, defaultSettings);

let uiRoot;

export const setUIRoot = (root) => {
  uiRoot = root;
};

export const getUIRoot = () => uiRoot;

let configLoaded = false;
let isUpdatingConfig = false;
let lastConfig;
const stringify = JSON.stringify;
let updateTimer = null;

export const markConfigLoaded = () => {
  configLoaded = true;
};

export const isConfigLoaded = () => configLoaded;

const updateConfig = () => {
  if (!configLoaded || isUpdatingConfig) return;
  isUpdatingConfig = true;

  initStore();

  const serialized = settings._serialize();
  const config = stringify(serialized);
  if (config !== lastConfig) {
    const encrypted = encryptDecrypt(config);
    const success = write(encrypted);
    if (success) {
      lastConfig = config;
    }
  }
  isUpdatingConfig = false;
};

export const startConfigPersistence = () => {
  if (updateTimer === null) {
    initStore();
    updateTimer = setInterval(() => {
      updateConfig();
    }, 250);
  }
};

export const loadSettings = (data) => {
  if (data && typeof data === 'object') {
    settings._deserialize(data);
  }
};

startConfigPersistence();
