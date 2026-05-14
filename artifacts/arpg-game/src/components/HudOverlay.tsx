/**
 * HudOverlay — bottom HUD with the new three-column layout:
 *   ┌──────────────┬─────────────────────────────────┬──────────────┐
 *   │ Chat panel   │ Avatar + Ability+Weapon hotbars │ Biometrics + │
 *   │              │                                 │ weapon card +│
 *   │              │                                 │ Book buttons │
 *   └──────────────┴─────────────────────────────────┴──────────────┘
 *
 * Renders over the 3D canvas. The book buttons trigger the three pixel-art
 * book overlays (Bestiary / Adventure / Magic).
 */

import { useState, useEffect, useRef } from 'react';
import type { PlayerStats, AbilityDef, WeaponStats } from '../game/types';
import { BookGlyph } from './books/BookIcons';
import './books/books.css';

interface HudOverlayProps {
  stats:            PlayerStats;
  abilities:        AbilityDef[];
  cooldowns:        Record<string, number>;
  equippedWeapons:  [WeaponStats, WeaponStats];
  characterName?:   string;
  characterEmoji?:  string;
  onOpenBestiary:   () => void;
  onOpenAdventure:  () => void;
  onOpenMagic:      () => void;
}

interface ChatMsg { id: number; from: string; text: string; }

let chatIdSeq = 0;

export function HudOverlay({
  stats, abilities, cooldowns, equippedWeapons,
  characterName = 'Survivor', characterEmoji = '🧍',
  onOpenBestiary, onOpenAdventure, onOpenMagic,
}: HudOverlayProps) {
  // ── Chat state (local for now, ready to wire to multiplayer later) ─────
  const [chatLog, setChatLog] = useState<ChatMsg[]>([
    { id: chatIdSeq++, from: 'System', text: 'Welcome to Grudges.' },
    { id: chatIdSeq++, from: 'System', text: 'Press K for Bestiary · I for Pack · P for Perks · O for Professions.' },
  ]);
  const [chatDraft, setChatDraft] = useState('');
  const chatLogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatLogRef.current) chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
  }, [chatLog]);

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatDraft.trim()) return;
    setChatLog(log => [...log.slice(-49), { id: chatIdSeq++, from: characterName, text: chatDraft.trim() }]);
    setChatDraft('');
  };

  // ── Hotbar slots ───────────────────────────────────────────────────────
  // 5 ability slots — pad with first 5 abilities
  const abilitySlots = abilities.slice(0, 5);
  while (abilitySlots.length < 5) abilitySlots.push(null as any);

  // 5 weapon slots — first two are equipped, rest empty for now
  const weaponSlots: (WeaponStats | null)[] = [equippedWeapons[0], equippedWeapons[1], null, null, null];

  return (
    <div className="hud-overlay">
      {/* ─── LEFT: chat ──────────────────────────────────────────── */}
      <div className="hud-panel hud-chat">
        <div className="hud-section-label">Field Comms</div>
        <div className="hud-chat-log" ref={chatLogRef}>
          {chatLog.map(m => (
            <p key={m.id}>
              <span style={{ color: m.from === 'System' ? '#c5a059' : '#fbe9b8', fontWeight: 700 }}>
                [{m.from}]
              </span>{' '}
              {m.text}
            </p>
          ))}
        </div>
        <form onSubmit={sendChat}>
          <input
            className="hud-chat-input"
            placeholder="Press Enter to send…"
            value={chatDraft}
            onChange={(e) => setChatDraft(e.target.value)}
            onFocus={() => { /* consume key events away from gameplay */ }}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </form>
      </div>

      {/* ─── CENTER: avatar + hotbars ────────────────────────────── */}
      <div className="hud-panel hud-center">
        <div>
          <div className="hud-avatar">
            <span>{characterEmoji}</span>
            <div className="hud-avatar-name">{characterName}</div>
          </div>
        </div>
        <div className="hud-hotbars">
          <div className="hud-hotbar-row">
            <span className="hud-hotbar-label">Skills</span>
            {abilitySlots.map((a, i) => {
              const cd = a ? Math.ceil(cooldowns[a.id] ?? 0) : 0;
              return (
                <div key={i} className="hud-slot" title={a?.description ?? ''}>
                  <span className="num">{i + 1}</span>
                  {a ? <span>{a.icon}</span> : <span style={{ opacity: 0.3 }}>·</span>}
                  {cd > 0 && <div className="cd-text">{cd}</div>}
                </div>
              );
            })}
          </div>
          <div className="hud-hotbar-row">
            <span className="hud-hotbar-label">Wpns</span>
            {weaponSlots.map((w, i) => (
              <div key={i} className="hud-slot" title={w?.name ?? `Slot ${i + 1}`}>
                <span className="num">{i + 6}</span>
                {w ? <span>{w.icon}</span> : <span style={{ opacity: 0.3 }}>·</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── RIGHT: biometrics + weapon card + book buttons ──────── */}
      <div className="hud-panel hud-right">
        <div className="hud-section-label">Vitals</div>
        <div className="hud-biometrics">
          <Bio label="HP"   color="#d44040" value={stats.health}      max={stats.maxHealth} />
          <Bio label="MP"   color="#5a9ad8" value={stats.mana}        max={stats.maxMana} />
          <Bio label="STA"  color="#6ec96e" value={stats.stamina}     max={stats.maxStamina} />
          <Bio label="HUNG" color="#c5a059" value={stats.hunger}      max={stats.maxHunger} />
          <Bio label="THIR" color="#5acdd8" value={stats.thirst}      max={stats.maxThirst} />
          <Bio label="FAT"  color="#a070c0" value={stats.fatigue}     max={stats.maxFatigue} />
          <Bio label="TEMP" color={stats.temperature < 34 ? '#5acdd8' : stats.temperature > 40 ? '#d44040' : '#fbe9b8'}
               value={stats.temperature - 30} max={15} valueLabel={`${stats.temperature.toFixed(1)}°`} />
        </div>

        <div className="hud-weapon-card">
          <div className="hud-weapon-icon">{equippedWeapons[0].icon}</div>
          <div className="hud-weapon-info">
            <div className="hud-weapon-name">{equippedWeapons[0].name}</div>
            <div className="hud-weapon-stat">DMG {equippedWeapons[0].damage} · {equippedWeapons[0].type}</div>
          </div>
        </div>

        <div className="hud-book-buttons">
          <button className="book-button" onClick={onOpenBestiary} title="Bestiary (K)">
            <span className="key">K</span>
            <span className="icon"><BookGlyph size={22} color="#c5a059" /></span>
            <span>Bestiary</span>
          </button>
          <button className="book-button" onClick={onOpenAdventure} title="Pack (I)">
            <span className="key">I</span>
            <span className="icon"><BookGlyph size={22} color="#c5a059" /></span>
            <span>Pack</span>
          </button>
          <button className="book-button" onClick={onOpenMagic} title="Perks (P)">
            <span className="key">P</span>
            <span className="icon"><BookGlyph size={22} color="#c5a059" /></span>
            <span>Perks</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Bio({ label, value, max, color, valueLabel }: {
  label: string; value: number; max: number; color: string; valueLabel?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <>
      <span className="hud-bio-label">{label}</span>
      <div className="hud-bio-bar">
        <div style={{ width: `${pct}%`, background: color, boxShadow: `0 0 4px ${color}` }} />
      </div>
      <span className="hud-bio-val">{valueLabel ?? Math.round(value)}</span>
    </>
  );
}
