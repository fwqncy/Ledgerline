'use client';

import {
  apcaContrast,
  applyPrefs,
  customThemeVars,
  DEFAULT_PREFS,
  hexToHsv,
  hsvToHex,
  PRESETS,
  type Prefs,
} from '@ledgerline/core/theme';
import { Box, toast } from '@ledgerline/core/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ColorWheel, type Hsv } from './ColorWheel';

const QUICK_PICKS = [
  { name: 'Oxblood', hex: '#7b1e2c' },
  { name: 'Navy', hex: '#1f3a68' },
  { name: 'Racing Green', hex: '#1f4d36' },
  { name: 'Mustard', hex: '#c99a2e' },
  { name: 'Ink Blue', hex: '#1f4e8c' },
  { name: 'Vermilion', hex: '#d2412c' },
  { name: 'Wolf Gold', hex: '#e8a317' },
  { name: 'Plum', hex: '#5b2a5e' },
];

const HEX = /^#?([0-9a-f]{6})$/i;

export function SettingsForm({ initial }: { initial: Prefs }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(initial.accent));
  const [hexDraft, setHexDraft] = useState(initial.accent);
  const [hexError, setHexError] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** Applies instantly, remembers in a cookie, and re-renders server parts (like the ticker) shortly after. */
  function update(next: Prefs) {
    setPrefs(next);
    applyPrefs(next);
    setSaved('Saved');
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 400);
  }

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(''), 1600);
    return () => clearTimeout(timer);
  }, [saved]);

  function setAccent(nextHsv: Hsv) {
    setHsv(nextHsv);
    const hex = hsvToHex(nextHsv.h, nextHsv.s, nextHsv.v);
    setHexDraft(hex);
    setHexError(null);
    update({ ...prefs, theme: 'custom', accent: hex });
  }

  function commitHex() {
    const match = HEX.exec(hexDraft.trim());
    if (!match) {
      setHexError('Use a 6-digit hex colour, like #7b1e2c.');
      return;
    }
    const hex = `#${match[1]!.toLowerCase()}`;
    setHexError(null);
    setHexDraft(hex);
    setHsv(hexToHsv(hex));
    update({ ...prefs, theme: 'custom', accent: hex });
  }

  const custom = customThemeVars(prefs.accent, prefs.paper);
  const contrast = Math.round(Math.abs(apcaContrast(prefs.accent, custom['--paper']!)));

  return (
    <div className="ll-settings">
      <p className="ll-visually-hidden" aria-live="polite">
        {saved}
      </p>

      <Box label="Colour Scheme" labelId="colour">
        <div className="ll-box__body" style={{ display: 'grid', gap: 18 }}>
          <fieldset className="ll-fieldset">
            <legend>Choose the House Style</legend>
            <div className="ll-theme-cards">
              {PRESETS.map((preset) => (
                <label key={preset.id} className="ll-theme-card">
                  <input
                    type="radio"
                    name="theme"
                    value={preset.id}
                    checked={prefs.theme === preset.id}
                    onChange={() => update({ ...prefs, theme: preset.id })}
                  />
                  <Preview paper={preset.swatches[0]} ink={preset.swatches[1]} accent={preset.swatches[2]} />
                  <span className="ll-theme-card__name">{preset.name}</span>
                  <span className="ll-theme-card__desc">{preset.description}</span>
                </label>
              ))}
              <label className="ll-theme-card">
                <input type="radio" name="theme" value="custom" checked={prefs.theme === 'custom'} onChange={() => update({ ...prefs, theme: 'custom' })} />
                <Preview paper={custom['--paper']!} ink={custom['--ink']!} accent={prefs.accent} />
                <span className="ll-theme-card__name">Your Own Colours</span>
                <span className="ll-theme-card__desc">Pick any ink on the wheel; the paper & type follow it.</span>
              </label>
            </div>
          </fieldset>

          {prefs.theme === 'custom' && (
            <div className="ll-wheel-panel">
              <ColorWheel value={hsv} onChange={setAccent} />
              <div className="ll-wheel-controls">
                <Slider label="Hue" min={0} max={359} value={Math.round(hsv.h)} suffix="°" onChange={(h) => setAccent({ ...hsv, h })} />
                <Slider label="Saturation" min={0} max={100} value={Math.round(hsv.s * 100)} suffix="%" onChange={(s) => setAccent({ ...hsv, s: s / 100 })} />
                <Slider label="Brightness" min={10} max={100} value={Math.round(hsv.v * 100)} suffix="%" onChange={(v) => setAccent({ ...hsv, v: v / 100 })} />

                <div className="ll-field">
                  <label className="ll-label" htmlFor="accent-hex">
                    Hex Colour
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className="ll-swatch" style={{ background: prefs.accent, cursor: 'default' }} aria-hidden />
                    <input
                      id="accent-hex"
                      className="ll-input ll-mono"
                      value={hexDraft}
                      spellCheck={false}
                      autoComplete="off"
                      autoCapitalize="off"
                      aria-invalid={Boolean(hexError) || undefined}
                      aria-describedby="accent-hex-note"
                      placeholder="#7b1e2c…"
                      onChange={(e) => setHexDraft(e.target.value)}
                      onBlur={commitHex}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitHex();
                        }
                      }}
                    />
                  </div>
                  <p id="accent-hex-note" className={hexError ? 'll-field__error' : 'll-field__hint'}>
                    {hexError ??
                      `Contrast on the paper: Lc ${contrast} (APCA). ${contrast >= 60 ? 'Reads well as text.' : contrast >= 30 ? 'Used for banners & candles; body text stays in ink.' : 'Too faint for banners, so ink is used instead.'}`}
                  </p>
                </div>

                <fieldset className="ll-fieldset">
                  <legend className="ll-label" style={{ fontFamily: 'inherit', fontSize: 16, letterSpacing: '0.1em', textTransform: 'none' }}>
                    Quick Picks
                  </legend>
                  <div className="ll-swatch-row">
                    {QUICK_PICKS.map((pick) => (
                      <button
                        key={pick.hex}
                        type="button"
                        className="ll-swatch"
                        style={{ background: pick.hex }}
                        aria-pressed={prefs.accent === pick.hex}
                        aria-label={pick.name}
                        title={pick.name}
                        onClick={() => {
                          setHexDraft(pick.hex);
                          setHsv(hexToHsv(pick.hex));
                          update({ ...prefs, theme: 'custom', accent: pick.hex });
                        }}
                      />
                    ))}
                  </div>
                </fieldset>

                <RadioRow
                  legend="Paper"
                  name="paper"
                  value={prefs.paper}
                  options={[
                    { value: 'light', label: 'Light Stock' },
                    { value: 'dark', label: 'Dark Stock' },
                  ]}
                  onChange={(paper) => update({ ...prefs, paper })}
                />
              </div>
            </div>
          )}
        </div>
      </Box>

      <Box label="Reading Preferences">
        <div className="ll-box__body" style={{ display: 'grid', gap: 18 }}>
          <RadioRow
            legend="Motion"
            name="motion"
            value={prefs.motion}
            options={[
              { value: 'system', label: 'Follow My System' },
              { value: 'reduce', label: 'Reduce Motion' },
              { value: 'full', label: 'Full Motion' },
            ]}
            onChange={(motion) => update({ ...prefs, motion })}
          />
          <RadioRow
            legend="Density"
            name="density"
            value={prefs.density}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
            onChange={(density) => update({ ...prefs, density })}
          />
          <RadioRow
            legend="Wire Ticker"
            name="ticker"
            value={prefs.ticker ? 'on' : 'off'}
            options={[
              { value: 'on', label: 'Show the Ticker' },
              { value: 'off', label: 'Hide the Ticker' },
            ]}
            onChange={(ticker) => update({ ...prefs, ticker: ticker === 'on' })}
          />
          <div>
            <button
              type="button"
              className="ll-button ll-button--ghost"
              onClick={() => {
                setHsv(hexToHsv(DEFAULT_PREFS.accent));
                setHexDraft(DEFAULT_PREFS.accent);
                update(DEFAULT_PREFS);
                toast.show({ tone: 'info', title: 'Back to the house style: Broadsheet.' });
              }}
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      </Box>
    </div>
  );
}

function Preview({ paper, ink, accent }: { paper: string; ink: string; accent: string }) {
  return (
    <span className="ll-theme-card__preview" style={{ background: paper }} aria-hidden>
      <span style={{ position: 'absolute', left: 10, right: 10, top: 8, height: 12, background: ink }} />
      <span style={{ position: 'absolute', left: 10, right: 10, top: 25, borderTop: `3px double ${ink}` }} />
      <span style={{ position: 'absolute', left: 10, width: '45%', top: 34, height: 26, background: accent }} />
      {[34, 42, 50, 58].map((top) => (
        <span key={top} style={{ position: 'absolute', right: 10, width: '38%', top, height: 3, background: ink, opacity: 0.6 }} />
      ))}
      <span
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          bottom: 8,
          height: 10,
          background: `repeating-conic-gradient(${ink} 0 25%, transparent 0 50%) 0 0 / 10px 10px`,
        }}
      />
    </span>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  suffix,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  const id = `slider-${label.toLowerCase()}`;
  return (
    <div className="ll-field">
      <label className="ll-label" htmlFor={id} style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span className="ll-mono">
          {value}
          {suffix}
        </span>
      </label>
      <input id={id} className="ll-range" type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function RadioRow<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="ll-fieldset">
      <legend>{legend}</legend>
      <div className="ll-radio-row">
        {options.map((option) => (
          <label key={option.value} className="ll-radio">
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
