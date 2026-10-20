// Follow-up comparisons with longer warmup and alternating order.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const {
  snapshot,
  seed,
  start,
  stop,
  load,
  dbOptions,
  beforeDb,
  afterDb,
  temp,
} = require('./performance.cjs');

const results = [];
const metadata = {
  warmupMs: 8000,
  rounds: 6,
  durationMs: 2000,
  concurrency: 8,
  order: 'A/B on even rounds; B/A on odd rounds',
  temp,
  beforeDb,
  afterDb,
};
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    (sorted[Math.floor((sorted.length - 1) / 2)] +
      sorted[Math.floor(sorted.length / 2)]) /
    2
  );
};

async function pair(a, b, route) {
  const servers = [];
  const runs = [[], []];
  try {
    for (let i = 0; i < 2; i++) {
      const variant = [a, b][i];
      servers.push(await start(variant.root, variant.db, 55301 + i));
      await load(55301 + i, route, 8, metadata.warmupMs);
    }
    for (let round = 0; round < metadata.rounds; round++) {
      for (const i of round % 2 === 0 ? [0, 1] : [1, 0]) {
        runs[i].push(await load(55301 + i, route, 8, metadata.durationMs));
      }
      console.log(`Completed ${route}, pair ${round + 1}/${metadata.rounds}`);
    }
    for (let i = 0; i < 2; i++) {
      const result = {
        name: [a, b][i].name,
        route,
        medianRps: median(runs[i].map((run) => run.rps)),
        medianP50: median(runs[i].map((run) => run.p50)),
        medianP95: median(runs[i].map((run) => run.p95)),
        responseBytes: median(runs[i].map((run) => run.bytes)),
        errors: runs[i].reduce((sum, run) => sum + run.errors, 0),
        runs: runs[i],
      };
      results.push(result);
      console.log(JSON.stringify(result));
    }
    fs.writeFileSync(
      path.join(__dirname, 'controlled-results.json'),
      JSON.stringify({ metadata, results }, null, 2),
    );
  } finally {
    for (const server of servers) await stop(server);
  }
}

(async () => {
  metadata.data = await seed();
  const original = snapshot('2dad917', 'original');
  const preschema = snapshot('4042e80', 'preschema');
  const current = snapshot('2b4dd87', 'current');
  const admin = new Client({ ...dbOptions, database: 'postgres' });
  await admin.connect();
  const smallBefore = `${beforeDb}_small`;
  const smallAfter = `${afterDb}_small`;
  await admin.query(`CREATE DATABASE "${smallBefore}" TEMPLATE "${beforeDb}"`);
  const db = new Client({ ...dbOptions, database: smallBefore });
  await db.connect();
  await db.query(
    'DELETE FROM tagged_users WHERE "tweetId" > 100; DELETE FROM tweets WHERE id > 100',
  );
  await db.query('VACUUM ANALYZE');
  await db.end();
  await admin.query(
    `CREATE DATABASE "${smallAfter}" TEMPLATE "${smallBefore}"`,
  );
  const after = new Client({ ...dbOptions, database: smallAfter });
  await after.connect();
  await after.query(`CREATE INDEX tweets_user_id_id ON tweets("userId", id);
    CREATE UNIQUE INDEX tagged_users_user_id_tweet_id ON tagged_users("userId", "tweetId");
    DROP INDEX tagged_users_user_id; ANALYZE;`);
  await after.end();
  await admin.end();
  metadata.smallDataset = { tweets: 100, smallBefore, smallAfter };
  await pair(
    { root: original, db: smallBefore, name: 'original-equal-100' },
    { root: current, db: smallAfter, name: 'current-equal-100' },
    '/tweets?limit=100',
  );
  for (const route of [
    '/tweets?limit=25',
    '/my-feed?limit=25',
    '/users/1/tweets?limit=25',
  ]) {
    await pair(
      { root: preschema, db: afterDb, name: 'without-schemas' },
      { root: current, db: afterDb, name: 'with-schemas' },
      route,
    );
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
