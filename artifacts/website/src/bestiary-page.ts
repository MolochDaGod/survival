/**
 * Bestiary page — vanilla-TS controller for bestiary.html.
 *
 * Fetches /data/bestiary.json (emitted by scripts/gen-bestiary-data.ts from
 * the canonical arpg-game bestiary.ts + creatures.ts) and renders a
 * searchable / filterable grid of entries, with a modal for full field notes.
 *
 * Intentionally NOT a React entry — the static parchment HTML pages avoid
 * React to keep the marketing site lightweight and CSP-friendly. See
 * vite.config.ts (input.bestiary) for the build wiring.
 */

interface BestiaryEntry {
  enemyKey: string;
  name: string;
  threatLevel: 1 | 2 | 3 | 4 | 5;
  classification: string;
  habitat: string;
  hp: number;
  damage: number;
  speed: number;
  weaknesses: string[];
  resistances: string[];
  loot: string[];
  lore: string;
  tips: string;
  behaviour: string;
  abilities: string[];
  firstSighted: string;
  accentColor: string;
  portrait?: string;
  role: string | null;
  ai: string | null;
  isCurated: boolean;
}

interface BestiaryPayload {
  generatedAt: string;
  source: string;
  count: number;
  curatedCount: number;
  entries: BestiaryEntry[];
}

const $grid    = document.getElementById('grid') as HTMLElement;
const $empty   = document.getElementById('empty') as HTMLElement;
const $search  = document.getElementById('q') as HTMLInputElement;
const $count   = document.getElementById('count') as HTMLElement;
const $tChips  = document.getElementById('threat-chips') as HTMLElement;
const $rChips  = document.getElementById('role-chips') as HTMLElement;
const $modalBg = document.getElementById('modal-back') as HTMLElement;
const $modal   = document.getElementById('modal') as HTMLElement;

let ALL: BestiaryEntry[] = [];
let activeThreat: 'all' | '1' | '2' | '3' | '4' | '5' = 'all';
let activeRole: string = 'all';
let query = '';

function monogram(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function portraitNode(e: BestiaryEntry, large = false): string {
  const cls = large ? 'portrait-lg' : 'portrait';
  if (e.portrait) {
    return `<div class="${cls}"><img src="${e.portrait}" alt="${escapeHtml(e.name)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'mono',textContent:'${monogram(e.name)}'}))"/></div>`;
  }
  return `<div class="${cls}"><span class="mono">${monogram(e.name)}</span></div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[c]!));
}

function threatDots(level: number): string {
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="dot${i < level ? ' on' : ''}"></span>`,
  ).join('');
}

function renderCard(e: BestiaryEntry): string {
  return `
    <article class="card${e.isCurated ? '' : ' stub'}" style="--accent:${e.accentColor}" data-key="${e.enemyKey}">
      <div class="card-head">
        ${portraitNode(e)}
        <div class="card-titles">
          <h3 class="name">${escapeHtml(e.name)}</h3>
          <div class="class">${escapeHtml(e.classification)}</div>
          <div class="threat" title="Threat level ${e.threatLevel}/5">${threatDots(e.threatLevel)}</div>
        </div>
      </div>
      <div class="habitat">${escapeHtml(e.habitat)}</div>
      <p class="lore-excerpt">${escapeHtml(e.lore)}</p>
      <div class="stat-strip">
        <div class="st"><div class="sv">${e.hp}</div><div class="sl">HP</div></div>
        <div class="st"><div class="sv">${e.damage}</div><div class="sl">DMG</div></div>
        <div class="st"><div class="sv">${e.speed.toFixed(1)}</div><div class="sl">SPD</div></div>
      </div>
      <button class="open-btn" type="button">▾ Field Notes</button>
    </article>`;
}

function renderModal(e: BestiaryEntry): string {
  const tags = (arr: string[], cls: string) =>
    arr.length
      ? `<div class="tag-row">${arr.map((t) => `<span class="tag ${cls}">${escapeHtml(t)}</span>`).join('')}</div>`
      : `<p style="color:var(--muted);font-size:.85rem;font-style:italic;margin:.1rem 0 0">None on file.</p>`;

  return `
    <button class="x" type="button" aria-label="Close">×</button>
    <div class="row2" style="--accent:${e.accentColor}">
      ${portraitNode(e, true)}
      <div>
        <h2>${escapeHtml(e.name)}</h2>
        <div class="sub">${escapeHtml(e.classification)} · ${escapeHtml(e.habitat)}</div>
        <div class="threat" style="--accent:${e.accentColor}" title="Threat ${e.threatLevel}/5">${threatDots(e.threatLevel)}</div>
        <div class="stats-grid" style="margin-top:.7rem">
          <div class="si"><div class="sv">${e.hp}</div><div class="sl">HP</div></div>
          <div class="si"><div class="sv">${e.damage}</div><div class="sl">Damage</div></div>
          <div class="si"><div class="sv">${e.speed.toFixed(1)}</div><div class="sl">Speed (m/s)</div></div>
        </div>
      </div>
    </div>
    <section><h4>Lore</h4><p>${escapeHtml(e.lore)}</p></section>
    ${e.isCurated ? `
      <section><h4>Combat Tips</h4><p>${escapeHtml(e.tips)}</p></section>
      <section><h4>Behaviour</h4><p>${escapeHtml(e.behaviour)}</p></section>
      <section><h4>Abilities</h4>${tags(e.abilities, 'loot')}</section>
    ` : `
      <section><h4>Behaviour</h4><p>${escapeHtml(e.behaviour)}</p></section>
    `}
    <section><h4>Weaknesses</h4>${tags(e.weaknesses, 'weak')}</section>
    <section><h4>Resistances</h4>${tags(e.resistances, 'resist')}</section>
    <section><h4>Confirmed Drops</h4>${tags(e.loot, 'loot')}</section>
    <section><h4>First Sighted</h4><p class="first">${escapeHtml(e.firstSighted)}</p></section>`;
}

function applyFilters(): BestiaryEntry[] {
  const q = query.trim().toLowerCase();
  return ALL.filter((e) => {
    if (activeThreat !== 'all' && String(e.threatLevel) !== activeThreat) return false;
    if (activeRole === 'curated') {
      if (!e.isCurated) return false;
    } else if (activeRole !== 'all') {
      if (e.role !== activeRole) return false;
    }
    if (!q) return true;
    const hay = `${e.name} ${e.classification} ${e.habitat} ${e.lore} ${e.behaviour} ${e.abilities.join(' ')} ${e.loot.join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
}

function render() {
  const filtered = applyFilters();
  $count.textContent = `${filtered.length} of ${ALL.length} entries`;
  $empty.hidden = filtered.length > 0;
  $grid.innerHTML = filtered.map(renderCard).join('');
  $grid.querySelectorAll<HTMLButtonElement>('.open-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = (btn.closest('.card') as HTMLElement).dataset.key!;
      const e = ALL.find((x) => x.enemyKey === key);
      if (e) openModal(e);
    });
  });
  $grid.querySelectorAll<HTMLElement>('.card').forEach((card) => {
    card.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('.open-btn')) return;
      const key = card.dataset.key!;
      const e = ALL.find((x) => x.enemyKey === key);
      if (e) openModal(e);
    });
  });
}

function openModal(e: BestiaryEntry) {
  $modal.innerHTML = renderModal(e);
  $modal.style.setProperty('--accent', e.accentColor);
  $modalBg.classList.add('open');
  document.body.style.overflow = 'hidden';
  $modal.querySelector<HTMLButtonElement>('.x')!.addEventListener('click', closeModal);
  $modal.focus();
}

function closeModal() {
  $modalBg.classList.remove('open');
  document.body.style.overflow = '';
}
$modalBg.addEventListener('click', (ev) => {
  if (ev.target === $modalBg) closeModal();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') closeModal();
});

$search.addEventListener('input', () => {
  query = $search.value;
  render();
});

function wireChipGroup(host: HTMLElement, attr: 'threat' | 'role') {
  host.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('.chip');
    if (!btn) return;
    host.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    const val = btn.dataset[attr]!;
    if (attr === 'threat') activeThreat = val as typeof activeThreat;
    else activeRole = val;
    render();
  });
}
wireChipGroup($tChips, 'threat');
wireChipGroup($rChips, 'role');

async function bootstrap() {
  try {
    const res = await fetch('/data/bestiary.json', { cache: 'no-cache' });
    const data: BestiaryPayload = await res.json();
    ALL = data.entries.sort((a, b) =>
      b.threatLevel - a.threatLevel
      || Number(b.isCurated) - Number(a.isCurated)
      || a.name.localeCompare(b.name),
    );
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById(`ct-${i}`);
      if (el) el.textContent = `(${ALL.filter((e) => e.threatLevel === i).length})`;
    }
    render();
  } catch (err) {
    $empty.hidden = false;
    $empty.textContent = 'Could not load bestiary data. Try again later.';
    console.error('[bestiary] load failed', err);
  }
}
bootstrap();
