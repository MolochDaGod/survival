import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DB_CHECK_URL });
await client.connect();
const res = await client.query(
  "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'characters' ORDER BY ordinal_position"
);
for (const r of res.rows) {
  console.log(r.column_name.padEnd(22), r.data_type.padEnd(20), r.is_nullable === 'YES' ? 'NULL' : 'NOT NULL');
}
// Try a test insert
try {
  const id = 'test_' + Date.now();
  await client.query(
    `INSERT INTO characters (id, account_id, name, race_id, class_id, level, xp, hp, energy, attributes, equipment, inventory, profession_levels, gold, experience, attribute_points, skill_points, config, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [id, '2d4d452d-e8b7-4377-b264-635e2cc62cce', 'DBTest', 'human', 'survivor', 1, 0, 100, 100, '{}', '{}', '[]', '{}', 0, 0, 24, 0, '{"name":"DBTest"}', Date.now(), Date.now()]
  );
  console.log('\nINSERT SUCCESS — id:', id);
  // Clean up
  await client.query("DELETE FROM characters WHERE id = $1", [id]);
  console.log('CLEANUP OK');
} catch (err) {
  console.error('\nINSERT FAILED:', err.message);
  console.error('Detail:', err.detail);
  console.error('Column:', err.column);
}
await client.end();
