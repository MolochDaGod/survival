/**
 * Characters service — business rules, validated DTOs, error semantics.
 *
 * Routes call this; this calls the repository. No HTTP, no SQL — just
 * domain logic. Throws typed `ServiceError`s that route handlers translate
 * into HTTP responses.
 */
import { z } from "zod";
import {
  charactersRepository,
  type CharacterRow,
} from "../repositories/charactersRepository";

export class ServiceError extends Error {
  constructor(
    public readonly code: "validation" | "not_found",
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
  }
}

const uuid = z.string().uuid();

const createSchema = z.object({
  accountId: uuid,
  name: z.string().min(1).max(64),
  config: z.unknown(),
});
export type CreateCharacterInput = z.infer<typeof createSchema>;

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  config: z.unknown().optional(),
  saveData: z.unknown().optional(),
  touchLastPlayed: z.boolean().optional(),
});
export type UpdateCharacterInput = z.infer<typeof updateSchema>;

export const charactersService = {
  list(accountId: string): Promise<CharacterRow[]> {
    const parsed = uuid.safeParse(accountId);
    if (!parsed.success) {
      throw new ServiceError("validation", "accountId (uuid) is required");
    }
    return charactersRepository.listForAccount(parsed.data);
  },

  async get(id: string): Promise<CharacterRow> {
    const parsed = uuid.safeParse(id);
    if (!parsed.success) {
      throw new ServiceError("validation", "invalid id");
    }
    const row = await charactersRepository.findById(parsed.data);
    if (!row) throw new ServiceError("not_found", "character not found");
    return row;
  },

  async create(input: unknown): Promise<CharacterRow> {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) {
      throw new ServiceError("validation", parsed.error.message, parsed.error.flatten());
    }
    const now = Date.now();
    try {
      return await charactersRepository.insert({
        id: crypto.randomUUID(),
        accountId: parsed.data.accountId,
        name: parsed.data.name,
        // Provide all NOT NULL columns explicitly so we don't depend on
        // DB-side defaults that may be missing after schema drift.
        raceId: 'human',
        classId: 'survivor',
        level: 1,
        xp: 0,
        hp: 100,
        energy: 100,
        attributes: {},
        equipment: {},
        inventory: [],
        professionLevels: {},
        gold: 0,
        experience: 0,
        attributePoints: 24,
        skillPoints: 0,
        config: (parsed.data.config ?? {}) as object,
        createdAt: now,
      });
    } catch (dbErr) {
      const { logger } = await import('../lib/logger');
      logger.error({ err: dbErr }, '[charactersService.create] DB insert failed');
      throw dbErr;
    }
  },

  async update(id: string, input: unknown): Promise<CharacterRow> {
    const idParsed = uuid.safeParse(id);
    if (!idParsed.success) {
      throw new ServiceError("validation", "invalid id");
    }
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) {
      throw new ServiceError("validation", parsed.error.message, parsed.error.flatten());
    }
    const patch: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.config !== undefined) patch.config = parsed.data.config;
    if (parsed.data.saveData !== undefined) patch.saveData = parsed.data.saveData;
    if (parsed.data.touchLastPlayed) patch.lastPlayedAt = new Date();

    if (Object.keys(patch).length === 0) {
      throw new ServiceError(
        "validation",
        "update payload must contain at least one of: name, config, saveData, touchLastPlayed",
      );
    }

    const row = await charactersRepository.update(idParsed.data, patch);
    if (!row) throw new ServiceError("not_found", "character not found");
    return row;
  },

  async remove(id: string): Promise<void> {
    const parsed = uuid.safeParse(id);
    if (!parsed.success) {
      throw new ServiceError("validation", "invalid id");
    }
    const ok = await charactersRepository.deleteById(parsed.data);
    if (!ok) throw new ServiceError("not_found", "character not found");
  },
};
