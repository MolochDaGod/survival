/**
 * Achievements Service
 * Manages character achievements and milestones
 */

import { db, achievementsTable, charactersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export class ServiceError extends Error {
  constructor(
    public code: "not_found" | "invalid_input" | "conflict",
    message: string,
    public detail?: string,
  ) {
    super(message);
  }
}

export interface AchievementInput {
  characterId: string;
  achievementKey: string;
  title: string;
  description?: string;
  iconUrl?: string;
  rarity?: "common" | "rare" | "epic" | "legendary";
}

export const achievementsService = {
  /**
   * Unlock an achievement
   */
  async unlock(input: AchievementInput) {
    if (!input.characterId || !input.achievementKey || !input.title) {
      throw new ServiceError("invalid_input", "characterId, achievementKey, and title required");
    }

    // Verify character exists
    const character = await db.query.charactersTable.findFirst({
      where: eq(charactersTable.id, input.characterId),
    });

    if (!character) {
      throw new ServiceError("not_found", "Character not found");
    }

    // Check if already unlocked
    const existing = await db.query.achievementsTable.findFirst({
      where: eq(achievementsTable.characterId, input.characterId),
    });

    if (existing) {
      throw new ServiceError("conflict", "Achievement already unlocked");
    }

    const [achievement] = await db
      .insert(achievementsTable)
      .values({
        id: randomUUID(),
        characterId: input.characterId,
        achievementKey: input.achievementKey,
        title: input.title,
        description: input.description ?? null,
        iconUrl: input.iconUrl ?? null,
        rarity: input.rarity ?? "common",
      })
      .returning();

    return achievement;
  },

  /**
   * Get achievements for character
   */
  async getForCharacter(characterId: string) {
    return db
      .select()
      .from(achievementsTable)
      .where(eq(achievementsTable.characterId, characterId))
      .orderBy(desc(achievementsTable.unlockedAt));
  },

  /**
   * Check if achievement is unlocked
   */
  async isUnlocked(characterId: string, achievementKey: string) {
    const achievement = await db.query.achievementsTable.findFirst({
      where: eq(achievementsTable.characterId, characterId),
    });

    return !!achievement;
  },

  /**
   * Get achievement by key
   */
  async getByKey(characterId: string, achievementKey: string) {
    const achievement = await db.query.achievementsTable.findFirst({
      where: eq(achievementsTable.characterId, characterId),
    });

    if (!achievement) {
      throw new ServiceError("not_found", "Achievement not found");
    }

    return achievement;
  },

  /**
   * Get achievement count
   */
  async getCount(characterId: string) {
    const result = await db
      .select({ count: db.sql<number>`count(*)` })
      .from(achievementsTable)
      .where(eq(achievementsTable.characterId, characterId));

    return result[0]?.count ?? 0;
  },

  /**
   * Get achievements by rarity
   */
  async getByRarity(characterId: string, rarity: string) {
    return db
      .select()
      .from(achievementsTable)
      .where(eq(achievementsTable.characterId, characterId))
      .orderBy(desc(achievementsTable.unlockedAt));
  },
};

