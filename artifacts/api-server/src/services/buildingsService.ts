/**
 * Buildings Service
 * Manages placed structures, bases, and constructions
 */

import { db, buildingsTable, charactersTable, prefabsTable } from "@workspace/db";
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

export interface BuildingInput {
  characterId: string;
  prefabId: string;
  name: string;
  buildingType: string;
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: number;
  health?: number;
  maxHealth?: number;
  level?: number;
  durability?: number;
  maxDurability?: number;
  storage?: Record<string, unknown>;
  production?: Record<string, unknown>;
  upgrades?: Record<string, unknown>;
  customData?: Record<string, unknown>;
}

export interface BuildingUpdate {
  name?: string;
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: number;
  health?: number;
  maxHealth?: number;
  level?: number;
  durability?: number;
  maxDurability?: number;
  isActive?: boolean;
  isDestroyed?: boolean;
  storage?: Record<string, unknown>;
  production?: Record<string, unknown>;
  upgrades?: Record<string, unknown>;
  customData?: Record<string, unknown>;
}

export const buildingsService = {
  /**
   * Place a building
   */
  async placeBuilding(input: BuildingInput) {
    if (!input.characterId || !input.prefabId || !input.name || !input.buildingType) {
      throw new ServiceError(
        "invalid_input",
        "characterId, prefabId, name, and buildingType required",
      );
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
      throw new ServiceError("not_found", "Building prefab not found");
    }

    const [building] = await db
      .insert(buildingsTable)
      .values({
        id: randomUUID(),
        characterId: input.characterId,
        prefabId: input.prefabId,
        name: input.name,
        buildingType: input.buildingType,
        position: input.position,
        rotation: input.rotation ?? {},
        scale: input.scale ?? 1.0,
        health: input.health ?? input.maxHealth ?? 100,
        maxHealth: input.maxHealth ?? 100,
        level: input.level ?? 1,
        durability: input.durability ?? input.maxDurability ?? 100,
        maxDurability: input.maxDurability ?? 100,
        storage: input.storage ?? null,
        production: input.production ?? null,
        upgrades: input.upgrades ?? {},
        customData: input.customData ?? null,
      })
      .returning();

    return building;
  },

  /**
   * Get buildings for character
   */
  async getBuildings(characterId: string) {
    return db
      .select({
        id: buildingsTable.id,
        characterId: buildingsTable.characterId,
        prefabId: buildingsTable.prefabId,
        prefabName: prefabsTable.name,
        name: buildingsTable.name,
        buildingType: buildingsTable.buildingType,
        position: buildingsTable.position,
        rotation: buildingsTable.rotation,
        scale: buildingsTable.scale,
        health: buildingsTable.health,
        maxHealth: buildingsTable.maxHealth,
        level: buildingsTable.level,
        durability: buildingsTable.durability,
        maxDurability: buildingsTable.maxDurability,
        isActive: buildingsTable.isActive,
        isDestroyed: buildingsTable.isDestroyed,
        storage: buildingsTable.storage,
        production: buildingsTable.production,
        upgrades: buildingsTable.upgrades,
        builtAt: buildingsTable.builtAt,
      })
      .from(buildingsTable)
      .leftJoin(prefabsTable, eq(buildingsTable.prefabId, prefabsTable.id))
      .where(eq(buildingsTable.characterId, characterId))
      .orderBy(desc(buildingsTable.builtAt));
  },

  /**
   * Get single building
   */
  async getBuilding(buildingId: string) {
    const building = await db.query.buildingsTable.findFirst({
      where: eq(buildingsTable.id, buildingId),
    });

    if (!building) {
      throw new ServiceError("not_found", "Building not found");
    }

    return building;
  },

  /**
   * Update building
   */
  async updateBuilding(buildingId: string, input: BuildingUpdate) {
    const building = await db.query.buildingsTable.findFirst({
      where: eq(buildingsTable.id, buildingId),
    });

    if (!building) {
      throw new ServiceError("not_found", "Building not found");
    }

    const [updated] = await db
      .update(buildingsTable)
      .set({
        name: input.name ?? building.name,
        position: input.position ?? building.position,
        rotation: input.rotation ?? building.rotation,
        scale: input.scale ?? building.scale,
        health: input.health ?? building.health,
        maxHealth: input.maxHealth ?? building.maxHealth,
        level: input.level ?? building.level,
        durability: input.durability ?? building.durability,
        maxDurability: input.maxDurability ?? building.maxDurability,
        isActive: input.isActive ?? building.isActive,
        isDestroyed: input.isDestroyed ?? building.isDestroyed,
        storage: input.storage ?? building.storage,
        production: input.production ?? building.production,
        upgrades: input.upgrades ?? building.upgrades,
        customData: input.customData ?? building.customData,
        updatedAt: new Date(),
      })
      .where(eq(buildingsTable.id, buildingId))
      .returning();

    return updated;
  },

  /**
   * Destroy building
   */
  async destroyBuilding(buildingId: string) {
    const building = await db.query.buildingsTable.findFirst({
      where: eq(buildingsTable.id, buildingId),
    });

    if (!building) {
      throw new ServiceError("not_found", "Building not found");
    }

    const [updated] = await db
      .update(buildingsTable)
      .set({
        isDestroyed: true,
        isActive: false,
        health: 0,
        updatedAt: new Date(),
      })
      .where(eq(buildingsTable.id, buildingId))
      .returning();

    return updated;
  },

  /**
   * Get buildings by type
   */
  async getBuildingsByType(characterId: string, buildingType: string) {
    return db
      .select()
      .from(buildingsTable)
      .where(
        and(
          eq(buildingsTable.characterId, characterId),
          eq(buildingsTable.buildingType, buildingType),
        ),
      );
  },

  /**
   * Get active buildings
   */
  async getActiveBuildings(characterId: string) {
    return db
      .select()
      .from(buildingsTable)
      .where(
        and(
          eq(buildingsTable.characterId, characterId),
          eq(buildingsTable.isActive, true),
          eq(buildingsTable.isDestroyed, false),
        ),
      );
  },

  /**
   * Upgrade building
   */
  async upgradeBuilding(buildingId: string, upgradeName: string) {
    const building = await db.query.buildingsTable.findFirst({
      where: eq(buildingsTable.id, buildingId),
    });

    if (!building) {
      throw new ServiceError("not_found", "Building not found");
    }

    const upgrades = (building.upgrades as Record<string, unknown>) || {};
    upgrades[upgradeName] = true;

    const [updated] = await db
      .update(buildingsTable)
      .set({
        upgrades,
        level: (building.level ?? 1) + 1,
        updatedAt: new Date(),
      })
      .where(eq(buildingsTable.id, buildingId))
      .returning();

    return updated;
  },
};

