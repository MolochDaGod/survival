/**
 * Characters repository — the only module that touches `charactersTable`.
 *
 * This is the bottom layer in the routes → services → repositories pattern:
 * it isolates Drizzle/SQL specifics so the rest of the server speaks in
 * plain typed functions. Other routes still use raw `db` for now; this is
 * the reference layering migrated first.
 */
import { db, charactersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

export type CharacterRow = typeof charactersTable.$inferSelect;
export type CharacterInsert = typeof charactersTable.$inferInsert;

export const charactersRepository = {
  listForAccount(accountId: string): Promise<CharacterRow[]> {
    return db
      .select()
      .from(charactersTable)
      .where(eq(charactersTable.accountId, accountId))
      .orderBy(
        desc(charactersTable.lastPlayedAt),
        desc(charactersTable.createdAt),
      );
  },

  findById(id: string): Promise<CharacterRow | undefined> {
    return db.query.charactersTable.findFirst({
      where: eq(charactersTable.id, id),
    });
  },

  async insert(values: CharacterInsert): Promise<CharacterRow> {
    const [row] = await db.insert(charactersTable).values(values).returning();
    return row;
  },

  async update(
    id: string,
    patch: Partial<CharacterInsert> & { lastPlayedAt?: Date },
  ): Promise<CharacterRow | undefined> {
    const [row] = await db
      .update(charactersTable)
      .set(patch)
      .where(eq(charactersTable.id, id))
      .returning();
    return row;
  },

  async deleteById(id: string): Promise<boolean> {
    const rows = await db
      .delete(charactersTable)
      .where(eq(charactersTable.id, id))
      .returning({ id: charactersTable.id });
    return rows.length > 0;
  },
};
