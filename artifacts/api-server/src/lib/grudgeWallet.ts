import { randomBytes } from "node:crypto";
import type { Account } from "@workspace/db";
import { db, accountsTable, eq } from "@workspace/db";

const CROSSMINT_BASE_URL =
  process.env.CROSSMINT_BASE_URL ?? "https://www.crossmint.com/api/v1-alpha2";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function toBase58(bytes: Uint8Array): string {
  let zeros = 0;
  for (const b of bytes) {
    if (b !== 0) break;
    zeros++;
  }
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i]! << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) {
    out += BASE58_ALPHABET[digits[i]!]!;
  }
  return out;
}

function generateServerWalletAddress(): string {
  return toBase58(randomBytes(32));
}

async function createCrossmintWallet(grudgeId: string, email?: string | null) {
  const apiKey = process.env.CROSSMINT_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(`${CROSSMINT_BASE_URL}/wallets`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "solana-mpc-wallet",
      linkedUser: email || `grudge:${grudgeId}`,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[grudgeWallet] Crossmint create failed:", res.status, text);
    return null;
  }

  const data = (await res.json()) as {
    id?: string;
    walletId?: string;
    address?: string;
    publicKey?: string;
  };

  return {
    walletId: data.id ?? data.walletId ?? null,
    walletAddress: data.address ?? data.publicKey ?? null,
    walletType: "crossmint" as const,
  };
}

/** Ensure the account has a Grudge ID server-side wallet address. */
export async function ensureAccountWallet(account: Account): Promise<string> {
  if (account.walletAddress) return account.walletAddress;

  const grudgeId = account.grudgeId ?? account.id;
  const crossmint = await createCrossmintWallet(grudgeId, account.email);
  const walletAddress = crossmint?.walletAddress ?? generateServerWalletAddress();
  const walletType = crossmint?.walletType ?? "server";
  const now = Date.now();

  const metadata = {
    ...(typeof account.metadata === "object" && account.metadata !== null
      ? (account.metadata as Record<string, unknown>)
      : {}),
    walletType,
    crossmintWalletId: crossmint?.walletId ?? null,
    walletProvisionedAt: now,
  };

  await db
    .update(accountsTable)
    .set({
      walletAddress,
      metadata,
      updatedAt: now,
    })
    .where(eq(accountsTable.id, account.id));

  return walletAddress;
}