/**
 * Allies Service
 * Manages companion NPCs, summons, and recruited allies
 */

import { db, alliesTable, charactersTable, prefabsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export class ServiceError extends Error {
  constructor(
    public code: "not_found" | "invalid_input",
    message: string,
    public detail?: string,
  ) {
    super(message);
  }
}

export interface AllyInput {
  characterId: string;
  prefabId: string;
  name: string;
  level?: number;
  health?: number;
  maxHealth?: number;
  stats?: Record<string, unknown>;
  equipment?: Record<string, unknown>;
  skills?: unknown[];
  loyalty?: number;
}

export interface AllyUpdate {
  name?: string;
  level?: number;
  experience?: number;
  health?: number;
  maxHealth?: number;
  stats?: Record<string, unknown>;
  equipment?: Record<string, unknown>;
  skills?: unknown[];
  loyalty?: number;
  isActive?: boolean;
}

export const alliesService = {
  /**
   * Recruit an ally
   */
  async recruit(input: AllyInput) {
    if (!input.characterId || !input.prefabId || !input.name) {
      throw new ServiceError("invalid_input", "characterId, prefabId, and name required");
    }

    // Verify character exists
    const character = await db.query.charactersTable.findFirst({
      where: eq(charactersTable.id, input.characterId),
    });

    if (!character) {
      throw new ServiceError("not_found", "Character not found");
    }

    // Verify prefab exists
    const prefab = await db.query.prefabsTable.findFirst({
      where: eq(prefabsTable.id, input.prefabId),
    });

    if (!prefab) {
      throw new ServiceError("not_found", "Ally prefab not found");
    }

    const [ally] = await db
      .insert(alliesTable)
      .values({
        id: randomUUID(),
        characterId: input.characterId,
        prefabId: input.prefabId,
        name: input.name,
        level: input.level ?? 1,
        health: input.health ?? input.maxHealth ?? 100,
        maxHealth: input.maxHealth ?? 100,
        stats: input.stats ?? {},
        equipment: input.equipment ?? {},
        skills: input.skills ?? [],
        loyalty: input.loyalty ?? 50,
      })
      .returning();

    return ally;
  },

  /**
   * Get allies for character
   */
  async getAllies(characterId: string) {
    return db
      .select({
        id: alliesTable.id,
        characterId: alliesTable.characterId,
        prefabId: alliesTable.prefabId,
        prefabName: prefabsTable.name,
        name: alliesTable.name,
        level: alliesTable.level,
        experience: alliesTable.experience,
        health: alliesTable.health,
        maxHealth: alliesTable.maxHealth,
        stats: alliesTable.stats,
        equipment: alliesTable.equipment,
        skills: alliesTable.skills,
        loyalty: alliesTable.loyalty,
        isActive: alliesTable.isActive,
        recruitedAt: alliesTable.recruitedAt,
      })
      .from(alliesTable)
      .leftJoin(prefabsTable, eq(alliesTable.prefabId, prefabsTable.id))
      .where(eq(alliesTable.characterId, characterId))
      .orderBy(desc(alliesTable.recruitedAt));
  },

  /**
   * Get single ally
   */
  async getAlly(allyId: string) {
    const ally = await db.query.alliesTable.findFirst({
      where: eq(alliesTable.id, allyId),
    });

    if (!ally) {
      throw new ServiceError("not_found", "Ally not found");
    }

    return ally;
  },

  /**
   * Update ally
   */
  async updateAlly(allyId: string, input: AllyUpdate) {
    const ally = await db.query.alliesTable.findFirst({
      where: eq(alliesTable.id, allyId),
    });

    if (!ally) {
      throw new ServiceError("not_found", "Ally not found");
    }

    const [updated] = await db
      .update(alliesTable)
      .set({
        name: input.name ?? ally.name,
        level: input.level ?? ally.level,
        experience: input.experience ?? ally.experience,
        health: input.health ?? ally.health,
        maxHealth: input.maxHealth ?? ally.maxHealth,
        stats: input.stats ?? ally.stats,
        equipment: input.equipment ?? ally.equipment,
        skills: input.skills ?? ally.skills,
        loyalty: input.loyalty ?? ally.loyalty,
        isActive: input.isActive ?? ally.isActive,
        updatedAt: new Date(),
      })
      .where(eq(alliesTable.id, allyId))
      .returning();

    return updated;
  },

  /**
   * Remove ally
   */
  async removeAlly(allyId: string) {
    const ally = await db.query.alliesTable.findFirst({
      where: eq(alliesTable.id, allyId),
    });

    if (!ally) {
      throw new ServiceError("not_found", "Ally not found");
    }

    await db.delete(alliesTable).where(eq(alliesTable.id, allyId));

    return true;
  },

  /**
   * Get active allies
   */
  async getActiveAllies(characterId: string) {
    return db
      .select()
      .from(alliesTable)
      .where(
        and(
          eq(alliesTable.characterId, characterId),
          eq(alliesTable.isActive, true),
        ),
      );
  },

  /**
   * Increase ally loyalty
   */
  async increaseLoyalty(allyId: string, amount: number) {
    const ally = await db.query.alliesTable.findFirst({
      where: eq(alliesTable.id, allyId),
    });

    if (!ally) {
      throw new ServiceError("not_found", "Ally not found");
    }

    const newLoyalty = Math.min(100, ally.loyalty + amount);

    const [updated] = await db
      .update(alliesTable)
      .set({ loyalty: newLoyalty, updatedAt: new Date() })
      .where(eq(alliesTable.id, allyId))
      .returning();

    return updated;
  },
};

