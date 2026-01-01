import { outer, outerDocument } from '@/core/outer.js';
import { settings } from '@/core/state.js';

const STYLE_ID = 'surt-blur-start-overlay';
const CSS_CONTENT = `
#start-overlay {
  backdrop-filter: blur(10px) brightness(0.9);
  -webkit-backdrop-filter: blur(10px) brightness(0.9);
}
#btn-game-quit {
  /* Ensure URL is quoted and provide sensible sizing */
  background-image: url("../img/gui/quit.svg") !important;
  background-repeat: no-repeat !important;
  background-size: contain !important;
}
#news-block {
  opacity: 0 !important;
  transition: 0.3s !important;
}
#news-block:hover {
  opacity: 1 !important;
}
#ad-block-left, #social-share-block, #start-bottom-middle .footer-after, #start-bottom-middle {
  pointer-events: none !important;
  opacity: 0 !important;
}
#start-row-header{
  background-image:url("https://i.postimg.cc/3JYQFmX0/image.png");
}

/* Glass-style stats */
.surt-stat {
  display: block;
  margin-bottom: 6px;
  padding: 6px 10px;
  font-size: 14px;
  line-height: 1;
  border-radius: 10px;
  color: #ffffff;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 6px 18px rgba(0,0,0,0.45);
  backdrop-filter: blur(6px) saturate(120%);
  -webkit-backdrop-filter: blur(6px) saturate(120%);
  text-shadow: 0 1px 0 rgba(0,0,0,0.35);
}
.surt-stat.surt-fps, .surt-stat.surt-ping {
  position: relative;
  left: 5px;
  top: -5px;
  font-size: 16px;
  font-weight: 600;
}
.surt-stat.surt-health, .surt-stat.surt-adr {
  position: fixed;
  top: 6px;
  z-index: 9999;
  font-size: 16px;
  font-weight: 700;
}
.surt-stat.surt-health { right: 15px; }
.surt-stat.surt-adr { left: 15px; }

/* Glow & pulse effects */
.surt-low {
  color: #FF6B6B !important;
  box-shadow: 0 0 8px rgba(255,107,107,0.9), 0 0 18px rgba(255,107,107,0.45);
  animation: surt-pulse-red 1.6s ease-in-out infinite;
  transform-origin: center;
}
.surt-warn {
  color: #FFD166 !important;
  box-shadow: 0 0 8px rgba(255,209,102,0.9), 0 0 14px rgba(255,209,102,0.4);
  animation: surt-glow-warn 2s ease-in-out infinite;
}
.surt-good {
  color: #7CFC00 !important;
  box-shadow: 0 0 8px rgba(124,252,0,0.9), 0 0 14px rgba(124,252,0,0.45);
  animation: surt-glow-green 2.4s ease-in-out infinite;
}

@keyframes surt-glow-warn {
  0% { box-shadow: 0 0 6px rgba(255,209,102,0.45); }
  50% { box-shadow: 0 0 14px rgba(255,209,102,0.95); }
  100% { box-shadow: 0 0 6px rgba(255,209,102,0.45); }
}

@keyframes surt-pulse-red {
  0% {
    box-shadow: 0 0 4px rgba(255,107,107,0.6), 0 0 12px rgba(255,107,107,0.35);
    transform: translateY(0);
  }
  50% {
    box-shadow: 0 0 14px rgba(255,107,107,1), 0 0 26px rgba(255,107,107,0.6);
    transform: translateY(-2px);
  }
  100% {
    box-shadow: 0 0 4px rgba(255,107,107,0.6), 0 0 12px rgba(255,107,107,0.35);
    transform: translateY(0);
  }
}

@keyframes surt-glow-green {
  0% {
    box-shadow: 0 0 6px rgba(124,252,0,0.45);
  }
  50% {
    box-shadow: 0 0 16px rgba(124,252,0,0.95);
  }
  100% {
    box-shadow: 0 0 6px rgba(124,252,0,0.45);
  }
}

@media (min-width:851px){

 /* Start row header */
 #start-row-header{
    height:140px;
    margin-bottom:0px;
 }
 
}
`;

export default function () {
  // Keep the style in sync with the user's setting.
  let applied = false;

  const applyStyle = () => {
    try {
      if (!outerDocument) return;
      const existing = outerDocument.getElementById(STYLE_ID);

      if (settings.blurBackground_ && settings.blurBackground_.enabled_) {
        if (!existing) {
          const s = outerDocument.createElement('style');
          s.id = STYLE_ID;
          s.type = 'text/css';
          s.innerHTML = CSS_CONTENT;
          outerDocument.head.appendChild(s);
        }
        applied = true;
      } else {
        if (existing) existing.remove();
        applied = false;
      }
    } catch { }
  };

  // Apply immediately and then poll occasionally so toggling in UI works.
  applyStyle();
  const interval = setInterval(applyStyle, 500);

  // Extras: FPS, Ping, Health, Armor highlights and optional FPS cap.
  let extrasInitialized = false;
  let origRequestAnimationFrame = null;
  let fpsTimes = [];
  let fpsEl = null;
  let pingEl = null;
  let healthEl = null;
  let adrEl = null;
  let healthInterval = null;
  let pingTimeout = null;
  let armorObservers = [];

  const initExtras = () => {
    if (extrasInitialized) return;
    try {
      // FPS cap
      const MAX = 240; // desired frame rate
      if (outer && outer.requestAnimationFrame) {
        origRequestAnimationFrame = outer.requestAnimationFrame;
        outer.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 1000 / MAX);
      }

      // FPS display
      try {
        const base = outerDocument.getElementsByClassName('ui-team-member ui-bg-standard')[0];
        if (base && !outerDocument.getElementById('surt-fps-display')) {
          fpsEl = outerDocument.createElement('p');
          fpsEl.id = 'surt-fps-display';
          base.parentNode.insertBefore(fpsEl, base);
          fpsEl.classList.add('surt-stat', 'surt-fps');
        }

        const tickFPS = () => {
          try {
            outer.requestAnimationFrame(() => {
              const now = performance.now();
              while (fpsTimes.length > 0 && fpsTimes[0] <= now - 1000) fpsTimes.shift();
              fpsTimes.push(now);
              if (fpsEl) {
                const fpsVal = fpsTimes.length;
                fpsEl.innerHTML = `${fpsVal} fps`;
                fpsEl.classList.remove('surt-low', 'surt-warn', 'surt-good');
                if (fpsVal <= 60) fpsEl.classList.add('surt-low');
                else if (fpsVal <= 120) fpsEl.classList.add('surt-warn');
                else fpsEl.classList.add('surt-good');
              }
              tickFPS();
            });
          } catch { }
        };
        tickFPS();
      } catch { }

      // Ping display
      try {
        const base = outerDocument.getElementsByClassName('ui-team-member ui-bg-standard')[0];
        if (base && !outerDocument.getElementById('surt-ping-display')) {
          pingEl = outerDocument.createElement('p');
          pingEl.id = 'surt-ping-display';
          base.parentNode.insertBefore(pingEl, base);
          pingEl.classList.add('surt-stat', 'surt-ping');
        }

        const doPing = () => {
          try {
            const start = Date.now();
            const req = new outer.XMLHttpRequest();
            req.open('GET', outer.location.href, true);
            req.onload = () => {
              const ms = Date.now() - start;
              if (pingEl) {
                pingEl.innerHTML = `${ms} ms`;
                pingEl.classList.remove('surt-low', 'surt-warn', 'surt-good');
                if (ms >= 200) pingEl.classList.add('surt-low');
                else if (ms >= 100) pingEl.classList.add('surt-warn');
                else pingEl.classList.add('surt-good');
              }
              pingTimeout = setTimeout(doPing, 500);
            };
            req.onerror = () => {
              if (pingEl) pingEl.innerHTML = '-- ms';
              pingTimeout = setTimeout(doPing, 1000);
            };
            req.send();
          } catch { pingTimeout = setTimeout(doPing, 1000); }
        };
        doPing();
      } catch { }

      // Health & ADR display
      try {
        const healthContainer = outerDocument.querySelector('#ui-health-container');
        if (healthContainer && !outerDocument.getElementById('surt-health-display')) {
          healthEl = outerDocument.createElement('span');
          healthEl.id = 'surt-health-display';
          healthEl.classList.add('surt-stat', 'surt-health');
          healthContainer.appendChild(healthEl);

          adrEl = outerDocument.createElement('span');
          adrEl.id = 'surt-adr-display';
          adrEl.classList.add('surt-stat', 'surt-adr');
          healthContainer.appendChild(adrEl);

          let lastHP = null;
          healthInterval = setInterval(() => {
            try {
              const hpEl = outerDocument.getElementById('ui-health-actual');
              const hp = hpEl ? hpEl.style.width.slice(0, -1) : null;
              if (hp !== null && hp !== lastHP) {
                lastHP = hp;
                const hpVal = Number.parseFloat(hp) || 0;
                healthEl.innerHTML = Math.round(hpVal);
                // Update health color state: <=30 red, 31-60 yellow, >60 green
                healthEl.classList.remove('surt-low', 'surt-warn', 'surt-good');
                if (hpVal <= 30) healthEl.classList.add('surt-low');
                else if (hpVal <= 60) healthEl.classList.add('surt-warn');
                else healthEl.classList.add('surt-good');
              }
              const boost0El = outerDocument.getElementById('ui-boost-counter-0')?.querySelector('.ui-bar-inner');
              const boost1El = outerDocument.getElementById('ui-boost-counter-1')?.querySelector('.ui-bar-inner');
              const boost2El = outerDocument.getElementById('ui-boost-counter-2')?.querySelector('.ui-bar-inner');
              const boost3El = outerDocument.getElementById('ui-boost-counter-3')?.querySelector('.ui-bar-inner');
              const boost0 = boost0El ? parseFloat(boost0El.style.width) : 0;
              const boost1 = boost1El ? parseFloat(boost1El.style.width) : 0;
              const boost2 = boost2El ? parseFloat(boost2El.style.width) : 0;
              const boost3 = boost3El ? parseFloat(boost3El.style.width) : 0;
              const adr0 = (boost0 * 25) / 100 + (boost1 * 25) / 100 + (boost2 * 37.5) / 100 + (boost3 * 12.5) / 100;
              adrEl.innerHTML = Math.round(adr0);
            } catch { }
          }, 250);
        }
      } catch { }

      // Armor color border
      try {
        const boxes = Array.from(outerDocument.getElementsByClassName('ui-armor-level'));
        boxes.forEach((box) => {
          const callback = () => {
            try {
              const armorlv = box.textContent?.trim();
              let color = '#000000';
              switch (armorlv) {
                case 'Lvl. 0':
                case 'Lvl. 1':
                  color = '#FFFFFF';
                  break;
                case 'Lvl. 2':
                  color = '#808080';
                  break;
                case 'Lvl. 3':
                  color = '#0C0C0C';
                  break;
                case 'Lvl. 4':
                  color = '#FFF00F';
                  break;
                default:
                  color = '#000000';
              }
              box.parentNode.style.border = `solid ${color}`;
            } catch { }
          };

          const mo = new MutationObserver(callback);
          mo.observe(box, { characterData: true, subtree: true, childList: true });
          armorObservers.push(mo);
        });
      } catch { }

      extrasInitialized = true;
    } catch { }
  };

  const cleanupExtras = () => {
    try {
      if (origRequestAnimationFrame) outer.requestAnimationFrame = origRequestAnimationFrame;
      if (fpsEl && fpsEl.parentNode) fpsEl.remove();
      if (pingEl && pingEl.parentNode) pingEl.remove();
      if (healthEl && healthEl.parentNode) healthEl.remove();
      if (adrEl && adrEl.parentNode) adrEl.remove();
      if (healthInterval) clearInterval(healthInterval);
      if (pingTimeout) clearTimeout(pingTimeout);
      armorObservers.forEach((mo) => mo.disconnect());
      armorObservers.length = 0;
      fpsTimes.length = 0;
      extrasInitialized = false;
    } catch { }
  };

  // Keep extras in sync with setting
  const applyExtras = () => {
    if (settings.blurBackground_ && settings.blurBackground_.enabled_) {
      initExtras();
    } else {
      cleanupExtras();
    }
  };

  applyExtras();
  const extrasInterval = setInterval(applyExtras, 1000);

  // We intentionally do not clear the intervals; they're lightweight and ensure toggles are applied.
}

