import { escapeHtml } from './lib/escapeHtml';

/**
 * Grudox landing — LED mask CNFT sales + personal mask AI assistant.
 */

const IDENTITY_KEY = "grudge_nexus_identity";
const MASK_PRICE = 1000;

interface Identity {
  grudgeId: string;
  kind: "puter" | "guest";
  displayName: string;
  puterUuid?: string;
}

interface MaskSkin {
  id: string;
  name: string;
  rarity: string;
  weight?: number;
  primary: string;
  secondary: string;
  glow: string;
  pattern: string;
}

interface LedMask {
  id: string;
  skinId: string;
  skinName: string;
  rarity: string;
  cnftMintId?: string;
  traits?: Partial<MaskSkin>;
}

interface AccountRow {
  gbuxBalance?: number;
  gbux_balance?: number;
  walletAddress?: string | null;
  wallet_address?: string | null;
  displayName?: string | null;
}

function $(sel: string) {
  return document.querySelector(sel) as HTMLElement | null;
}

function accountGbux(row: AccountRow | null): number {
  return row?.gbuxBalance ?? row?.gbux_balance ?? 0;
}

function accountWallet(row: AccountRow | null): string | null {
  return row?.walletAddress ?? row?.wallet_address ?? null;
}

function readIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Identity;
  } catch {
    return null;
  }
}

function saveIdentity(id: Identity) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(id));
}

function clearIdentity() {
  localStorage.removeItem(IDENTITY_KEY);
}

async function waitForPuter(ms = 5000): Promise<void> {
  if (typeof puter !== "undefined") return;
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (typeof puter !== "undefined") return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Puter SDK failed to load");
}

async function signInPuter(): Promise<Identity> {
  await waitForPuter();
  const user = await puter.auth.signIn();
  const id: Identity = {
    grudgeId: `puter_${user.uuid}`,
    kind: "puter",
    displayName: user.username ?? "Survivor",
    puterUuid: user.uuid,
  };
  saveIdentity(id);
  await upsertAccount(id);
  return id;
}

function signInGuest(): Identity {
  let id = readIdentity();
  if (id?.kind === "guest") return id;
  const guestId = `guest_${crypto.randomUUID()}`;
  id = { grudgeId: guestId, kind: "guest", displayName: "Survivor" };
  saveIdentity(id);
  void upsertAccount(id);
  return id;
}

async function upsertAccount(id: Identity) {
  await fetch("/api/accounts/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grudgeId: id.grudgeId,
      displayName: id.displayName,
      puterUuid: id.puterUuid,
    }),
  });
}

async function fetchAccount(grudgeId: string) {
  const res = await fetch(`/api/accounts/${encodeURIComponent(grudgeId)}`);
  if (!res.ok) return null;
  return res.json() as Promise<AccountRow>;
}

function applySkinPreview(skin: MaskSkin) {
  const mask = $("#mask-preview");
  if (!mask) return;
  mask.style.setProperty("--mask-primary", skin.primary);
  mask.style.setProperty("--mask-secondary", skin.secondary);
  mask.style.setProperty("--mask-glow", skin.glow);
  mask.dataset.pattern = skin.pattern;
  const name = $("#preview-name");
  const rarity = $("#preview-rarity");
  if (name) name.textContent = skin.name;
  if (rarity) {
    rarity.textContent = skin.rarity;
    rarity.dataset.rarity = skin.rarity;
  }
}

async function previewRoll() {
  const res = await fetch("/api/masks/preview-roll", { method: "POST" });
  if (!res.ok) return;
  const data = (await res.json()) as { skin: MaskSkin };
  applySkinPreview(data.skin);
}

function setStatus(msg: string, isError = false) {
  const el = $("#status-msg");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

function renderSkinGallery(skins: MaskSkin[]) {
  const grid = $("#skin-gallery");
  if (!grid) return;
  grid.innerHTML = "";
  for (const skin of skins) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "skin-card";
    card.dataset.rarity = skin.rarity;
    card.innerHTML = `
      <div class="skin-swatch" style="--sw-primary:${skin.primary};--sw-secondary:${skin.secondary};--sw-glow:${skin.glow}" data-pattern="${skin.pattern}"></div>
      <strong>${skin.name}</strong>
      <span>${skin.rarity}</span>
    `;
    card.addEventListener("click", () => applySkinPreview(skin));
    grid.appendChild(card);
  }
}

async function loadCatalog() {
  const res = await fetch("/api/masks/catalog");
  if (!res.ok) return;
  const data = (await res.json()) as { skins: MaskSkin[] };
  renderSkinGallery(data.skins);
}

function updateWalletUI(
  id: Identity | null,
  account: AccountRow | null,
  masks: LedMask[],
) {
  const signed = $("#signed-in");
  const signedOut = $("#signed-out");
  const nameEl = $("#user-name");
  const gbuxEl = $("#gbux-balance");
  const walletEl = $("#wallet-addr");
  const mintBtn = $("#mint-btn") as HTMLButtonElement | null;
  const assistant = $("#assistant-panel");

  if (id) {
    signed?.classList.remove("hidden");
    signedOut?.classList.add("hidden");
    if (nameEl) nameEl.textContent = id.displayName;
    const bal = accountGbux(account);
    if (gbuxEl) gbuxEl.textContent = String(bal);
    if (walletEl) {
      const addr = accountWallet(account);
      walletEl.textContent = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "Provisioned on mint";
    }
    if (mintBtn) {
      mintBtn.disabled = bal < MASK_PRICE;
      mintBtn.textContent =
        bal < MASK_PRICE ? `Need ${MASK_PRICE} GBUX` : `Mint Mask · ${MASK_PRICE} GBUX`;
    }
    const hasMask = masks.length > 0;
    if (assistant) {
      assistant.classList.toggle("locked", !hasMask);
    }
    if (hasMask) {
      const latest = masks[0]!;
      const traits = latest.traits ?? {};
      applySkinPreview({
        id: latest.skinId,
        name: latest.skinName,
        rarity: latest.rarity,
        primary: traits.primary ?? "#5eb3ff",
        secondary: traits.secondary ?? "#1a2744",
        glow: traits.glow ?? "#5eb3ff",
        pattern: traits.pattern ?? "pulse",
      });
    }
  } else {
    signed?.classList.add("hidden");
    signedOut?.classList.remove("hidden");
    assistant?.classList.add("locked");
  }
}

async function loadState(id: Identity) {
  const [account, masksRes] = await Promise.all([
    fetchAccount(id.grudgeId),
    fetch(`/api/masks/mine?grudgeId=${encodeURIComponent(id.grudgeId)}`),
  ]);
  const masks = masksRes.ok ? ((await masksRes.json()) as LedMask[]) : [];
  updateWalletUI(id, account, masks);
  return { account, masks };
}

async function purchaseMask(id: Identity) {
  const mintBtn = $("#mint-btn") as HTMLButtonElement | null;
  if (mintBtn) mintBtn.disabled = true;
  setStatus("Rolling skin and minting to your Grudge wallet…");
  try {
    const res = await fetch("/api/masks/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grudgeId: id.grudgeId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error ?? "Purchase failed", true);
      return;
    }
    applySkinPreview(data.skin as MaskSkin);
    setStatus(`Minted ${data.skin.name} (${data.skin.rarity})`);
    $("#reveal-modal")?.classList.add("open");
    const revealTitle = $("#reveal-title");
    const revealMint = $("#reveal-mint");
    if (revealTitle) revealTitle.textContent = data.skin.name;
    if (revealMint) revealMint.textContent = data.mask.cnftMintId;
    await loadState(id);
  } finally {
    if (mintBtn) mintBtn.disabled = false;
  }
}

function appendChat(role: string, text: string) {
  const log = $("#chat-log");
  if (!log) return;
  const p = document.createElement("p");
  p.className = role === "user" ? "chat-user" : "chat-ai";
  p.innerHTML =
    role === "user"
      ? `<strong>You</strong> ${escapeHtml(text)}`
      : `<strong>Mask AI</strong> ${escapeHtml(text)}`;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
}

async function sendChat(id: Identity, masks: LedMask[]) {
  const input = $("#chat-input") as HTMLInputElement | null;
  if (!input?.value.trim()) return;
  const message = input.value.trim();
  input.value = "";
  appendChat("user", message);

  const latest = masks[0];
  const res = await fetch("/api/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grudgeId: id.grudgeId,
      message,
      maskName: latest?.skinName,
      maskRarity: latest?.rarity,
    }),
  });
  const data = (await res.json()) as { reply: string };
  appendChat("ai", data.reply);
}

async function boot() {
  const id = readIdentity();
  let masks: LedMask[] = [];
  if (id) {
    const state = await loadState(id);
    masks = state.masks;
  } else {
    updateWalletUI(null, null, []);
  }

  await Promise.all([previewRoll(), loadCatalog()]);

  $("#mask-preview")?.addEventListener("click", () => void previewRoll());

  $("#btn-puter")?.addEventListener("click", async () => {
    try {
      const newId = await signInPuter();
      const state = await loadState(newId);
      masks = state.masks;
      setStatus("Signed in with Grudge ID");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Sign-in failed", true);
    }
  });

  $("#btn-guest")?.addEventListener("click", async () => {
    const newId = signInGuest();
    const state = await loadState(newId);
    masks = state.masks;
    setStatus("Playing as guest — link Puter to keep your mask across devices");
  });

  $("#btn-signout")?.addEventListener("click", () => {
    clearIdentity();
    masks = [];
    updateWalletUI(null, null, []);
    setStatus("Signed out");
    void previewRoll();
  });

  $("#btn-preview")?.addEventListener("click", () => void previewRoll());

  $("#mint-btn")?.addEventListener("click", async () => {
    const current = readIdentity();
    if (!current) {
      setStatus("Sign in first", true);
      return;
    }
    await purchaseMask(current);
    const state = await loadState(current);
    masks = state.masks;
  });

  $("#chat-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const current = readIdentity();
    if (!current) {
      setStatus("Sign in to talk to your mask AI", true);
      return;
    }
    if (masks.length === 0) {
      setStatus("Mint a LED mask to unlock your personal AI assistant", true);
      return;
    }
    await sendChat(current, masks);
  });

  $("#reveal-close")?.addEventListener("click", () => {
    $("#reveal-modal")?.classList.remove("open");
  });
}

boot().catch((e) => setStatus(String(e), true));

declare const puter: {
  auth: { signIn: () => Promise<{ uuid: string; username?: string }> };
};