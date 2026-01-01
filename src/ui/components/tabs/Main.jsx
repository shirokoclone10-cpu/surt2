import React from 'react';
import Checkbox, { WarningCheckbox } from '@/ui/components/interaction/Checkbox.jsx';
import Slider, { WarningSlider } from '@/ui/components/interaction/Slider.jsx';
import SectionTitle from '@/ui/components/layout/SectionTitle.jsx';
import { Icons } from '@/ui/components/icons.jsx';
import KeybindSlot from '@/ui/components/interaction/KeybindSlot.jsx';

const Main = ({ settings, onSettingChange }) => {
  return (
    <div className="section">
      <SectionTitle
        icon={Icons.Aimbot_}
        label="Aimbot"
        keybind={settings.keybinds_.toggleAimbot_}
        keybindEditable={true}
        onKeybindChange={(newKey) => onSettingChange((s) => (s.keybinds_.toggleAimbot_ = newKey))}
        enabled={settings.aimbot_.enabled_}
        onEnabledChange={(v) => onSettingChange((s) => (s.aimbot_.enabled_ = v))}
      />
      <div className={`group ${!settings.aimbot_.enabled_ ? 'hidden' : ''}`}>
        <Checkbox
          id="target-knocked"
          label="Target Knocked"
          checked={settings.aimbot_.targetKnocked_}
          onChange={(v) => onSettingChange((s) => (s.aimbot_.targetKnocked_ = v))}
        />
        <Checkbox
          id="aimbot-show-dot"
          label="Aimbot Dot"
          checked={settings.aimbot_.showDot_}
          onChange={(v) => onSettingChange((s) => (s.aimbot_.showDot_ = v))}
        />

        <WarningCheckbox
          id="aimbot-wallcheck"
          label="Wallcheck"
          checked={settings.aimbot_.wallcheck_}
          onChange={(v) => onSettingChange((s) => (s.aimbot_.wallcheck_ = v))}
          shouldWarning={(v) => !v}
        />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <WarningCheckbox
            id="aimbot-aim-allies"
            label="Aim Allies (Aim Teammates)"
            checked={settings.aimbot_.aimAllies_}
            onChange={(v) => onSettingChange((s) => (s.aimbot_.aimAllies_ = v))}
            shouldWarning={(v) => v}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <Checkbox
            id="aimbot-automatic"
            label="Blatant"
            checked={settings.aimbot_.automatic_}
            onChange={(v) => onSettingChange((s) => (s.aimbot_.automatic_ = v))}
            warning={true}
          />
          <KeybindSlot
            keybind={settings.keybinds_.toggleAutomatic_}
            editable={true}
            onClick={(newKey) => onSettingChange((s) => (s.keybinds_.toggleAutomatic_ = newKey))}
          />
        </div>
      </div>

      <SectionTitle
        icon={Icons.MeleeLock_}
        label="Melee Lock"
        enabled={settings.meleeLock_.enabled_}
        onEnabledChange={(v) => onSettingChange((s) => (s.meleeLock_.enabled_ = v))}
        warning={true}
      />
      <div className={`group ${!settings.meleeLock_.enabled_ ? 'hidden' : ''}`}>
        <Checkbox
          id="auto-melee"
          label="Auto Melee"
          checked={settings.meleeLock_.autoMelee_}
          onChange={(v) => onSettingChange((s) => (s.meleeLock_.autoMelee_ = v))}
        />
        <Checkbox
          id="auto-attack"
          label="Auto Attack"
          checked={settings.meleeLock_.autoAttack_}
          onChange={(v) => onSettingChange((s) => (s.meleeLock_.autoAttack_ = v))}
        />
        <Checkbox
          id="attack-allies"
          label="Attack Allies"
          checked={settings.meleeLock_.attackAllies_}
          onChange={(v) => onSettingChange((s) => (s.meleeLock_.attackAllies_ = v))}
          warning={true}
        />
      </div>

      <SectionTitle
        icon={Icons.AutoSwitch_}
        label="Auto Switch"
        enabled={settings.autoSwitch_.enabled_}
        onEnabledChange={(v) => onSettingChange((s) => (s.autoSwitch_.enabled_ = v))}
      />
      <div className={`group ${!settings.autoSwitch_.enabled_ ? 'hidden' : ''}`}>
        <Checkbox
          id="useonegun"
          label="Use One Gun"
          checked={settings.autoSwitch_.useOneGun_}
          onChange={(v) => onSettingChange((s) => (s.autoSwitch_.useOneGun_ = v))}
        />
      </div>

      <SectionTitle
        icon={Icons.SemiAuto_}
        label="Semi Auto"
        enabled={settings.autoFire_.enabled_}
        onEnabledChange={(v) => onSettingChange((s) => (s.autoFire_.enabled_ = v))}
      />

      <SectionTitle
        icon={Icons.Heal_}
        label="Auto Heal"
        enabled={settings.autoHeal_.enabled_}
        onEnabledChange={(v) => onSettingChange((s) => (s.autoHeal_.enabled_ = v))}
      />
    </div>
  );
};

export default Main;
