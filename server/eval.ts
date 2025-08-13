import { db } from './db'; // tsx resolves .ts automatically

async function main() {
  // ---- A) How many vectors do we have?
  const a = await db.execute(
    "SELECT COUNT(*)::int AS total, COUNT(embedding)::int AS have_vec FROM charts"
  );
  console.log('counts:', a.rows[0]); // expect { total: 120, have_vec: 120 }

  // Pick a seed id that definitely exists
  const seed = await db.execute(
    "SELECT id FROM charts WHERE embedding IS NOT NULL ORDER BY id LIMIT 1"
  );
  const seedId = seed.rows[0].id;
  console.log('seed id:', seedId);

  // ---- B) Prove DB can return many neighbors (no app code involved)
  const b = await db.execute(`
    WITH q AS (SELECT embedding FROM charts WHERE id = ${seedId})
    SELECT id,
           (1 - (embedding <=> (SELECT embedding FROM q)))::float8 AS sim
    FROM charts
    WHERE id <> ${seedId} AND embedding IS NOT NULL
    ORDER BY embedding <=> (SELECT embedding FROM q)
    LIMIT 10
  `);

  console.table(b.rows); // expect ~10 rows with decreasing sim
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
