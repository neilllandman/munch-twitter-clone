// Run against a dedicated PostgreSQL container; creates databases named bench_*.
// DB_PORT=55432 node benchmarks/performance.cjs
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { Client } = require('pg');
const { createSigner } = require('fast-jwt');

const repo = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'munch-bench-'));
const dbOptions = {
  host: '127.0.0.1',
  port: Number(process.env.DB_PORT || 55432),
  user: 'postgres',
  password: 'postgres',
};
const runId = Date.now();
const beforeDb = `bench_${runId}_before`;
const afterDb = `bench_${runId}_after`;
const rounds = Number(process.env.BENCH_ROUNDS || 3);
const duration = Number(process.env.BENCH_DURATION_MS || 2000);
const results = [];
const privateKey = fs.readFileSync(path.join(repo, 'private.dev.pem'));
const token = createSigner({ key: privateKey, algorithm: 'RS256' })({
  sub: 1,
  usr: { id: 1, username: 'user1', email: 'user1@example.org' },
});

function snapshot(ref, name) {
  const root = path.join(temp, name);
  fs.mkdirSync(root);
  const archive = spawnSync('git', ['archive', ref], {
    cwd: repo,
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(archive.status, 0, archive.stderr.toString());
  const unpack = spawnSync('tar', ['-x', '-C', root], {
    input: archive.stdout,
  });
  assert.equal(unpack.status, 0);
  fs.symlinkSync(
    path.join(repo, 'node_modules'),
    path.join(root, 'node_modules'),
  );
  function compile(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const source = path.join(directory, item.name);
      if (item.isDirectory()) compile(source);
      else if (source.endsWith('.ts') && !source.endsWith('.spec.ts')) {
        const output = path
          .join(root, 'dist', path.relative(path.join(root, 'src'), source))
          .replace(/\.ts$/, '.js');
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(
          output,
          ts.transpileModule(fs.readFileSync(source, 'utf8'), {
            compilerOptions: {
              module: ts.ModuleKind.CommonJS,
              target: ts.ScriptTarget.ES2017,
              esModuleInterop: true,
            },
          }).outputText,
        );
      }
    }
  }
  // Identical transpilation/dependencies for every snapshot. No baseline source fixes.
  compile(path.join(root, 'src'));
  return root;
}

async function seed() {
  const admin = new Client({ ...dbOptions, database: 'postgres' });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${beforeDb}"`);
  const db = new Client({ ...dbOptions, database: beforeDb });
  await db.connect();
  await db.query(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY, username VARCHAR(100) NOT NULL UNIQUE,
      email VARCHAR(100) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE tweets (
      id SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL REFERENCES users(id),
      content VARCHAR(280) NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE tagged_users (
      id SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL REFERENCES users(id),
      "tweetId" INTEGER NOT NULL REFERENCES tweets(id),
      "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX tagged_users_user_id ON tagged_users("userId");
    CREATE INDEX tagged_users_tweet_id ON tagged_users("tweetId");
    INSERT INTO users (username, email, password, "createdAt", "updatedAt")
      SELECT 'user' || n, 'user' || n || '@example.org', 'unused', NOW(), NOW()
      FROM generate_series(1, 1000) n;
    INSERT INTO tweets ("userId", content, "createdAt", "updatedAt")
      SELECT ((n - 1) % 1000) + 1,
        'Demo post ' || n || ': ' || repeat('A realistic short update about the interview demo. ', 3),
        TIMESTAMPTZ '2026-01-01' + n * INTERVAL '1 second',
        TIMESTAMPTZ '2026-01-01' + n * INTERVAL '1 second'
      FROM generate_series(1, 100000) n;
    INSERT INTO tagged_users ("userId", "tweetId", "createdAt", "updatedAt")
      SELECT ((t."userId" + offset_id - 1) % 1000) + 1, t.id, t."createdAt", t."updatedAt"
      FROM tweets t CROSS JOIN generate_series(1, 2) offset_id WHERE t.id % 3 = 0;
    INSERT INTO tagged_users ("userId", "tweetId", "createdAt", "updatedAt")
      SELECT 1, t.id, t."createdAt", t."updatedAt" FROM tweets t
      WHERE t.id % 20 = 0 AND t."userId" <> 1
        AND NOT EXISTS (SELECT 1 FROM tagged_users m WHERE m."tweetId" = t.id AND m."userId" = 1);
  `);
  const counts = await db.query(`SELECT
    (SELECT COUNT(*)::int FROM users) users,
    (SELECT COUNT(*)::int FROM tweets) tweets,
    (SELECT COUNT(*)::int FROM tagged_users) mentions`);
  await db.query('ANALYZE');
  await db.end();
  await admin.query(`CREATE DATABASE "${afterDb}" TEMPLATE "${beforeDb}"`);
  const after = new Client({ ...dbOptions, database: afterDb });
  await after.connect();
  await after.query(`CREATE INDEX tweets_user_id_id ON tweets("userId", id);
    CREATE UNIQUE INDEX tagged_users_user_id_tweet_id ON tagged_users("userId", "tweetId");
    DROP INDEX tagged_users_user_id; ANALYZE;`);
  await after.end();
  await admin.end();
  return counts.rows[0];
}

async function start(root, database, port) {
  const log = fs.openSync(
    path.join(temp, `${path.basename(root)}-${port}.log`),
    'a',
  );
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      APP_LOG_LEVEL: 'warn',
      APP_HOST: '127.0.0.1',
      APP_PORT: String(port),
      DB_HOST: dbOptions.host,
      DB_PORT: String(dbOptions.port),
      DB_USERNAME: dbOptions.user,
      DB_PASSWORD: dbOptions.password,
      DB_NAME: database,
    },
    stdio: ['ignore', log, log],
  });
  fs.closeSync(log);
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw new Error(`Server exited: ${root}; logs at ${temp}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) return child;
    } catch {}
    await delay(100);
  }
  child.kill('SIGINT');
  throw new Error('Server start timeout');
}

async function stop(child) {
  if (child.exitCode === null) {
    const done = once(child, 'exit');
    child.kill('SIGINT');
    await done;
  }
}

function makeRequest(port, route, agent, body) {
  return new Promise((resolve) => {
    const start = performance.now();
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: route,
        agent,
        method: body ? 'POST' : 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          ...(body
            ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(body),
              }
            : {}),
        },
      },
      (response) => {
        let bytes = 0;
        response.on('data', (data) => {
          bytes += data.length;
        });
        response.on('end', () =>
          resolve({
            ms: performance.now() - start,
            bytes,
            status: response.statusCode,
          }),
        );
      },
    );
    req.on('error', () =>
      resolve({ ms: performance.now() - start, bytes: 0, status: 0 }),
    );
    req.setTimeout(10000, () => req.destroy());
    req.end(body);
  });
}

async function load(port, route, concurrency, milliseconds, body) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: concurrency });
  const samples = [];
  const start = performance.now();
  const deadline = start + milliseconds;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (performance.now() < deadline)
        samples.push(await makeRequest(port, route, agent, body));
    }),
  );
  const elapsed = (performance.now() - start) / 1000;
  agent.destroy();
  const ok = samples.filter(
    (sample) => sample.status >= 200 && sample.status < 300,
  );
  const latency = ok.map((sample) => sample.ms).sort((a, b) => a - b);
  const percentile = (p) =>
    latency[Math.min(latency.length - 1, Math.floor(latency.length * p))] ??
    null;
  return {
    rps: ok.length / elapsed,
    p50: percentile(0.5),
    p95: percentile(0.95),
    requests: samples.length,
    errors: samples.length - ok.length,
    bytes: ok.length
      ? ok.reduce((sum, sample) => sum + sample.bytes, 0) / ok.length
      : 0,
  };
}

async function benchmark(root, database, name, route, concurrency, body) {
  const child = await start(root, database, 55300);
  try {
    await load(55300, route, concurrency, 1000, body);
    const runs = [];
    for (let round = 0; round < rounds; round++)
      runs.push(await load(55300, route, concurrency, duration, body));
    const median = (field) =>
      runs.map((run) => run[field]).sort((a, b) => a - b)[
        Math.floor(rounds / 2)
      ];
    const result = {
      name,
      route,
      concurrency,
      medianRps: median('rps'),
      medianP50: median('p50'),
      medianP95: median('p95'),
      responseBytes: median('bytes'),
      errors: runs.reduce((sum, run) => sum + run.errors, 0),
      runs,
    };
    results.push(result);
    console.log(JSON.stringify(result));
    fs.writeFileSync(
      path.join(__dirname, 'results.json'),
      JSON.stringify({ metadata, results }, null, 2),
    );
  } finally {
    await stop(child);
  }
}

let metadata;
async function main() {
  const original = snapshot('2dad917', 'original');
  const preschema = snapshot('4042e80', 'preschema');
  const current = snapshot('2b4dd87', 'current');
  metadata = {
    date: new Date().toISOString(),
    node: process.version,
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0].model,
    memoryGB: os.totalmem() / 1024 ** 3,
    original: '2dad917',
    preschema: '4042e80',
    current: '2b4dd87',
    dependencies: Object.fromEntries(
      ['fastify', '@fastify/jwt', 'sequelize', 'pg'].map((name) => [
        name,
        require(`${name}/package.json`).version,
      ]),
    ),
    rounds,
    duration,
    temp,
    databases: { beforeDb, afterDb },
    data: await seed(),
  };
  console.log(JSON.stringify(metadata));

  // Actual default behavior: original endpoints return everything; current returns 25.
  for (const route of ['/tweets', '/my-feed', '/users/1/tweets']) {
    await benchmark(original, beforeDb, 'original-default', route, 2);
    await benchmark(current, afterDb, 'current-default', route, 2);
  }
  // Equal-size user timelines: 100 posts per user in the seeded data.
  await benchmark(
    original,
    beforeDb,
    'original-equal-100',
    '/users/1/tweets?limit=100',
    8,
  );
  await benchmark(
    current,
    afterDb,
    'current-equal-100',
    '/users/1/tweets?limit=100',
    8,
  );
  // Isolate response schemas: identical query code, indexes, dependencies, and pages.
  for (const route of [
    '/tweets?limit=25',
    '/my-feed?limit=25',
    '/users/1/tweets?limit=25',
  ]) {
    await benchmark(preschema, afterDb, 'without-schemas', route, 8);
    await benchmark(current, afterDb, 'with-schemas', route, 8);
  }
  // Write contention: the original lookup obtains a second pooled connection.
  const body = JSON.stringify({ content: 'Benchmark post @user2 @user3' });
  await benchmark(original, beforeDb, 'original-write', '/tweets', 1, body);
  await benchmark(current, afterDb, 'current-write', '/tweets', 1, body);
  await benchmark(
    original,
    beforeDb,
    'original-concurrent-write',
    '/tweets',
    8,
    body,
  );
  await benchmark(
    current,
    afterDb,
    'current-concurrent-write',
    '/tweets',
    8,
    body,
  );
  console.log(`Results: ${path.join(__dirname, 'results.json')}`);
}

module.exports = {
  snapshot,
  seed,
  start,
  stop,
  load,
  dbOptions,
  beforeDb,
  afterDb,
  temp,
};
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
