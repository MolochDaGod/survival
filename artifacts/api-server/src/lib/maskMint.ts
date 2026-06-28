import type { MaskSkin } from "../data/maskSkins";

const CROSSMINT_BASE_URL =
  process.env.CROSSMINT_BASE_URL ?? "https://www.crossmint.com/api/2022-06-09";

const CROSSMINT_COLLECTION_MASKS =
  process.env.CROSSMINT_COLLECTION_MASKS ?? process.env.CROSSMINT_COLLECTION_CHARACTERS;

export interface MaskMintResult {
  cnftMintId: string;
  mintStatus: "minted" | "pending" | "recorded";
  crossmintActionId?: string;
}

export async function mintMaskCnft(
  maskId: string,
  skin: MaskSkin,
  walletAddress: string,
  grudgeId: string,
): Promise<MaskMintResult> {
  const apiKey = process.env.CROSSMINT_API_KEY;
  const fallbackId = `grudge-mask-${maskId.replace(/-/g, "").slice(0, 16)}`;

  if (!apiKey || !CROSSMINT_COLLECTION_MASKS) {
    return { cnftMintId: fallbackId, mintStatus: "recorded" };
  }

  const metadata = {
    name: `${skin.name} LED Mask`,
    symbol: "GRUDOX",
    description: `Grudox LED mask — ${skin.rarity} rarity. Rolled skin for Grudge ID ${grudgeId}.`,
    image: `https://grudox.grudge-studio.com/opengraph.jpg`,
    attributes: [
      { trait_type: "Skin", value: skin.name },
      { trait_type: "Rarity", value: skin.rarity },
      { trait_type: "Pattern", value: skin.pattern },
      { trait_type: "Glow", value: skin.glow },
      { trait_type: "Type", value: "LED Mask" },
    ],
    properties: {
      category: "led-mask",
      grudgeId,
      maskId,
      skinId: skin.id,
      studio: "Grudge Studio",
    },
  };

  try {
    const res = await fetch(
      `${CROSSMINT_BASE_URL}/collections/${CROSSMINT_COLLECTION_MASKS}/nfts`,
      {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: `solana:${walletAddress}`,
          metadata,
          compressed: true,
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[maskMint] Crossmint mint failed:", res.status, text);
      return { cnftMintId: fallbackId, mintStatus: "recorded" };
    }

    const data = (await res.json()) as {
      id?: string;
      actionId?: string;
      onChain?: { mintHash?: string };
    };

    const mintId =
      data.onChain?.mintHash ?? data.id ?? data.actionId ?? fallbackId;

    return {
      cnftMintId: mintId,
      mintStatus: data.onChain?.mintHash ? "minted" : "pending",
      crossmintActionId: data.actionId ?? data.id,
    };
  } catch (err) {
    console.error("[maskMint] mint error:", err);
    return { cnftMintId: fallbackId, mintStatus: "recorded" };
  }
}