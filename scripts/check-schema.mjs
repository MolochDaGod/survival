import pg from 'pg';
const { Pool } = pg;
const p = new Pool({ connectionString: process.env.DATABASE_URL });
const r = await p.query(`
  SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name IN ('accounts','characters','prefabs','spawn_rules')
  ORDER BY table_name, ordinal_position
`);
let cur = '';
for (const row of r.rows) {
  if (row.table_name !== cur) { console.log(`\n--- ${row.table_name} ---`); cur = row.table_name; }
  console.log(`  ${row.column_name}: ${row.data_type}${row.is_nullable === 'NO' ? ' NOT NULL' : ''}`);
}
if (r.rows.length === 0) console.log('No matching tables found');
await p.end();
