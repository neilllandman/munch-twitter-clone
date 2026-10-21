const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:net');
const { setTimeout: delay } = require('node:timers/promises');
const { before, after, describe, it } = require('node:test');
const { Client } = require('pg');

// This suite rebuilds the schema. Use a dedicated integration database only.
if (!process.env.DB_NAME?.endsWith('_integration')) {
  throw new Error('Set DB_NAME to a dedicated database ending in _integration');
}

const env = {
  ...process.env,
  NODE_ENV: 'production',
  APP_HOST: '127.0.0.1',
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: process.env.DB_PORT || '55432',
};
const db = new Client({
  host: env.DB_HOST || '127.0.0.1',
  port: Number(env.DB_PORT || 55432),
  user: env.DB_USERNAME || 'postgres',
  password: env.DB_PASSWORD || 'postgres',
  database: env.DB_NAME,
});
const suffix = `${Date.now()}`;
const accounts = {};
const tweets = [];
let server;
let serverLog = '';
let baseUrl;

function migrate(command) {
  const result = spawnSync(
    process.execPath,
    ['node_modules/sequelize-cli/lib/sequelize', command],
    { env, encoding: 'utf8', timeout: 30000 },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

async function request(path, { account, body, token } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    signal: AbortSignal.timeout(10000),
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token || account
        ? {
            authorization: `Bearer ${token || accounts[account].token}`,
          }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

async function startChild(
  extraEnv = {},
  command = process.execPath,
  args = ['dist/main.js'],
) {
  const child = spawn(command, args, {
    env: { ...env, APP_PORT: '0', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      const address = output.match(
        /Server listening at (http:\/\/127\.0\.0\.1:\d+)/,
      );
      if (address) return { child, address: address[1], output: () => output };
      if (child.exitCode !== null) throw new Error(output);
      await delay(100);
    }
    throw new Error(`Child did not start:\n${output}`);
  } catch (error) {
    child.kill('SIGKILL');
    throw error;
  }
}

before(
  async () => {
    await db.connect();
    migrate('db:migrate');
    const portProbe = createServer();
    portProbe.listen(0, '127.0.0.1');
    await once(portProbe, 'listening');
    const port = portProbe.address().port;
    await new Promise((resolve, reject) =>
      portProbe.close((error) => (error ? reject(error) : resolve())),
    );
    server = spawn(process.execPath, ['dist/main.js'], {
      env: { ...env, APP_PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const collect = (chunk) => {
      serverLog += chunk.toString();
    };
    server.stdout.on('data', collect);
    server.stderr.on('data', collect);
    // Read Fastify's listen log so requests only begin after startup completes.
    for (let attempt = 0; attempt < 100; attempt++) {
      const address = serverLog.match(
        /Server listening at (http:\/\/127\.0\.0\.1:\d+)/,
      );
      if (address) {
        baseUrl = address[1];
        return;
      }
      if (server.exitCode !== null) throw new Error(serverLog);
      await delay(100);
    }
    throw new Error(`Server did not start:\n${serverLog}`);
  },
  { timeout: 30000 },
);

after(async () => {
  if (server && server.exitCode === null) {
    const stopped = once(server, 'exit');
    server.kill('SIGINT');
    await stopped;
  }
  await db.end();
});

describe('API against PostgreSQL', { concurrency: false }, () => {
  it('imports the entry point without starting the server or installing signal handlers', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `const before = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]; require('./dist/main'); const after = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]; if (String(before) !== String(after)) process.exitCode = 1;`,
      ],
      { env, encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });

  it('fails on invalid configuration before connecting or listening', () => {
    const result = spawnSync(process.execPath, ['dist/main.js'], {
      env: { ...env, APP_PORT: 'not-a-port', DB_PASSWORD: 'private-value' },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /APP_PORT/);
    assert.doesNotMatch(result.stderr, /private-value/);
    assert.doesNotMatch(result.stdout, /Server listening/);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    it(`drains and closes database connections on ${signal}`, async () => {
      const applicationName = `munch_lifecycle_${signal}_${suffix}`;
      const { child, address, output } = await startChild(
        { PGAPPNAME: applicationName },
        signal === 'SIGTERM' ? 'sh' : process.execPath,
        signal === 'SIGTERM' ? ['run.sh'] : ['dist/main.js'],
      );
      try {
        const response = await fetch(`${address}/healthz`);
        assert.deepEqual(await response.json(), { status: 'ok' });
        const connections = await db.query(
          'SELECT pid FROM pg_stat_activity WHERE application_name = $1',
          [applicationName],
        );
        assert(connections.rowCount > 0, output());
        const stopped = once(child, 'exit');
        child.kill(signal);
        const [code, exitSignal] = await stopped;
        assert.equal(code, 0, output());
        assert.equal(exitSignal, null, output());
        assert.match(output(), /Application shutdown complete/);
        const remaining = await db.query(
          'SELECT pid FROM pg_stat_activity WHERE application_name = $1',
          [applicationName],
        );
        assert.equal(remaining.rowCount, 0);
      } finally {
        if (child.exitCode === null) child.kill('SIGKILL');
      }
    });
  }

  it('cancels a database retry promptly on SIGTERM', async () => {
    const child = spawn(process.execPath, ['dist/main.js'], {
      env: { ...env, APP_PORT: '0', DB_PORT: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (output.includes('Database unavailable; retrying startup')) break;
        if (child.exitCode !== null) throw new Error(output);
        await delay(100);
      }
      assert.match(output, /Database unavailable; retrying startup/);
      const stopped = once(child, 'exit');
      child.kill('SIGTERM');
      const [code, exitSignal] = await stopped;
      assert.equal(code, 0, output);
      assert.equal(exitSignal, null, output);
      assert.doesNotMatch(output, /Server listening/);
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  });

  it('reports health and rejects missing or invalid authentication', async () => {
    assert.deepEqual(await request('/healthz'), {
      status: 200,
      body: { status: 'ok' },
    });
    for (const path of [
      '/tweets',
      '/my-feed',
      '/users/1/tweets',
      '/auth/user',
      '/search/tweets?q=hello',
      '/search/users?q=ali',
    ]) {
      assert.equal((await request(path)).status, 401);
      assert.equal((await request(path, { token: 'invalid' })).status, 401);
    }
  });

  it('registers users, hashes passwords, and logs in by username and email', async () => {
    for (const name of ['alice', 'bob', 'chris']) {
      const username = `${name}_${suffix}`;
      const email = `${username}@example.org`;
      const registered = await request('/auth/register', {
        body: { username, email, password: 'integration-password' },
      });
      assert.equal(registered.status, 200, JSON.stringify(registered.body));
      assert.equal(typeof registered.body.token, 'string');
      assert.equal(registered.body.user.password, undefined);
      accounts[name] = { ...registered.body, username, email };
      for (const credentials of [{ username }, { email }]) {
        const login = await request('/auth/login', {
          body: { ...credentials, password: 'integration-password' },
        });
        assert.equal(login.status, 200, JSON.stringify(login.body));
        assert.equal(login.body.user.id, registered.body.user.id);
      }
    }
    const stored = await db.query('SELECT password FROM users WHERE id = $1', [
      accounts.alice.user.id,
    ]);
    assert.match(stored.rows[0].password, /^\$2[aby]\$/);
    assert.equal(
      (
        await request('/auth/login', {
          body: { username: accounts.alice.username, password: 'wrong' },
        })
      ).status,
      401,
    );
  });

  it('returns the authenticated user without their password', async () => {
    const response = await request('/auth/user', { account: 'alice' });
    assert.equal(response.status, 200);
    assert.equal(response.body.id, accounts.alice.user.id);
    assert.equal(response.body.password, undefined);
  });

  it('validates tweet lengths and creates mentions with punctuation and duplicates', async () => {
    for (const content of ['', 'a'.repeat(281)]) {
      assert.equal(
        (await request('/tweets', { account: 'alice', body: { content } }))
          .status,
        400,
      );
    }
    for (let i = 0; i < 32; i++) {
      const author = ['alice', 'bob', 'chris'][i % 3];
      const content =
        i % 2 === 0
          ? `Post ${i}: (@${accounts.bob.username}), @${accounts.alice.username}!\n@${accounts.bob.username}`
          : `Plain post ${i}`;
      const response = await request('/tweets', {
        account: author,
        body: { content },
      });
      assert.equal(response.status, 201, JSON.stringify(response.body));
      tweets.push({ ...response.body, author });
    }
    const mention = tweets[0];
    const result = await db.query(
      'SELECT "userId" FROM tagged_users WHERE "tweetId" = $1',
      [mention.id],
    );
    // Alice wrote this post, so only Bob is tagged, exactly once.
    assert.deepEqual(
      result.rows.map((row) => row.userId),
      [accounts.bob.user.id],
    );
  });

  it('paginates all three feeds without duplicates, gaps, or unrelated posts', async () => {
    const bobId = accounts.bob.user.id;
    const feedRows = await db.query(
      `
      SELECT t.id FROM tweets t WHERE t."userId" = $1 OR EXISTS (
        SELECT 1 FROM tagged_users m WHERE m."tweetId" = t.id AND m."userId" = $1
      ) ORDER BY t.id DESC`,
      [bobId],
    );
    const allRows = await db.query('SELECT id FROM tweets ORDER BY id DESC');
    const cases = [
      ['/tweets', allRows.rows.map((row) => row.id)],
      [
        `/users/${bobId}/tweets`,
        tweets
          .filter((tweet) => tweet.author === 'bob')
          .map((tweet) => tweet.id)
          .reverse(),
      ],
      ['/my-feed', feedRows.rows.map((row) => row.id)],
    ];
    for (const [path, expected] of cases) {
      const first = await request(path, { account: 'bob' });
      assert.equal(first.status, 200, JSON.stringify(first.body));
      assert.deepEqual(
        first.body.map((tweet) => tweet.id),
        expected.slice(0, 25),
      );
      const seen = [];
      let beforeId;
      for (let page = 0; page < 100; page++) {
        const query = `?limit=4${beforeId ? `&beforeId=${beforeId}` : ''}`;
        const response = await request(`${path}${query}`, { account: 'bob' });
        assert.equal(response.status, 200, JSON.stringify(response.body));
        assert(response.body.length <= 4);
        if (!response.body.length) break;
        seen.push(...response.body.map((tweet) => tweet.id));
        beforeId = response.body.at(-1).id;
      }
      assert.deepEqual(seen, expected, path);
      assert.equal(new Set(seen).size, seen.length);
      assert.equal(
        (await request(`${path}?limit=101`, { account: 'bob' })).status,
        400,
      );
      assert.equal(
        (await request(`${path}?beforeId=-1`, { account: 'bob' })).status,
        400,
      );
    }
    const userPosts = await request(`/users/${accounts.alice.user.id}/tweets`, {
      account: 'alice',
    });
    const tagged = userPosts.body.find((tweet) => tweet.id === tweets[0].id);
    assert.equal(tagged.taggedUsers.length, 1);
    assert.equal(tagged.taggedUsers[0].userId, bobId);
  });

  it('enforces foreign keys and uniqueness of mention pairs', async () => {
    await assert.rejects(
      db.query(
        `
      INSERT INTO tagged_users ("userId", "tweetId", "createdAt", "updatedAt")
      VALUES ($1, $2, NOW(), NOW())`,
        [accounts.bob.user.id, tweets[0].id],
      ),
      { code: '23505' },
    );
    await assert.rejects(
      db.query(`
      INSERT INTO tweets ("userId", content, "createdAt", "updatedAt")
      VALUES (2147483647, 'Invalid author', NOW(), NOW())`),
      { code: '23503' },
    );
  });

  it('creates concurrent mentioned tweets without exhausting the connection pool', async () => {
    // More concurrent writes than Sequelize's default five-connection pool.
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        request('/tweets', {
          account: 'alice',
          body: {
            content: `Concurrent ${index}: @${accounts.bob.username}, @${accounts.chris.username}!`,
          },
        }),
      ),
    );
    for (const response of responses) {
      assert.equal(response.status, 201, JSON.stringify(response.body));
      const mentions = await db.query(
        'SELECT "userId" FROM tagged_users WHERE "tweetId" = $1 ORDER BY "userId"',
        [response.body.id],
      );
      assert.deepEqual(
        mentions.rows.map((row) => row.userId),
        [accounts.bob.user.id, accounts.chris.user.id],
      );
    }
  });

  it('rolls back the tweet when inserting mentions fails', async () => {
    const beforeCount = await db.query('SELECT COUNT(*) FROM tweets');
    await db.query(`CREATE FUNCTION reject_test_mention() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'forced integration failure'; END; $$`);
    await db.query(`CREATE TRIGGER reject_test_mention BEFORE INSERT ON tagged_users
      FOR EACH ROW EXECUTE FUNCTION reject_test_mention()`);
    try {
      const response = await request('/tweets', {
        account: 'alice',
        body: { content: `Rollback @${accounts.bob.username}` },
      });
      assert.equal(response.status, 500);
      const afterCount = await db.query('SELECT COUNT(*) FROM tweets');
      assert.deepEqual(afterCount.rows, beforeCount.rows);
    } finally {
      await db.query('DROP TRIGGER reject_test_mention ON tagged_users');
      await db.query('DROP FUNCTION reject_test_mention()');
    }
  });

  it('searches post words with stemming, AND semantics, and cursor pagination', async () => {
    const marker = `findme${suffix}`;
    const contents = [
      `${marker} Running by the river`,
      `${marker} She runs every morning`,
      `${marker} A quiet garden`,
      `${marker} Run through the garden`,
      ...Array.from({ length: 28 }, (_, i) => `${marker} Walking outside ${i}`),
    ];
    const created = [];
    for (const content of contents) {
      const response = await request('/tweets', {
        account: 'alice',
        body: { content },
      });
      assert.equal(response.status, 201);
      created.push(response.body);
    }
    const search = async (q, extra = '') => {
      const response = await request(
        `/search/tweets?q=${encodeURIComponent(q)}${extra}`,
        { account: 'bob' },
      );
      assert.equal(response.status, 200, JSON.stringify(response.body));
      return response.body;
    };
    const expected = [created[3].id, created[1].id, created[0].id];
    assert.deepEqual(
      (await search(`  ${marker} RUN!!!  `)).map((tweet) => tweet.id),
      expected,
    );
    assert.deepEqual(
      (await search(`${marker} running garden`)).map((tweet) => tweet.id),
      [created[3].id],
    );
    const first = await search(`${marker} run`, '&limit=2');
    const second = await search(
      `${marker} run`,
      `&limit=2&beforeId=${first.at(-1).id}`,
    );
    assert.deepEqual(
      [...first, ...second].map((tweet) => tweet.id),
      expected,
    );
    assert.equal(first[0].user.username, accounts.alice.username);
    assert.equal(first[0].user.password, undefined);
    const all = await search(marker, '&limit=100');
    assert.deepEqual(
      all.map((tweet) => tweet.id),
      created.map((tweet) => tweet.id).reverse(),
    );
    assert.equal((await search(marker)).length, 25);
    for (const q of [
      'the and of',
      '!!!',
      `${marker} absentword`,
      "zzzinjectionprobe' OR 1=1 --",
    ]) {
      assert.deepEqual(await search(q), []);
    }
  });

  it('searches usernames by a literal case-insensitive prefix without exposing private fields', async () => {
    const prefix = `seek_${suffix}_`;
    const usernames = [
      `${prefix}Alice`,
      `${prefix}ALICIA`,
      `${prefix}100%Real`,
      `${prefix}100xReal`,
      `${prefix}!a`,
      `${prefix}!!a`,
      `${prefix}\\a`,
      ...Array.from({ length: 30 }, (_, i) => `${prefix}person${i}`),
      `seekX${suffix}_Alice`,
    ];
    const inserted = await db.query(
      `INSERT INTO users (username, email, password, "createdAt", "updatedAt")
      SELECT name, name || '@example.org', 'private-hash', NOW(), NOW() FROM unnest($1::text[]) AS name
      RETURNING id, username`,
      [usernames],
    );
    const search = async (q, extra = '') => {
      const response = await request(
        `/search/users?q=${encodeURIComponent(q)}${extra}`,
        { account: 'alice' },
      );
      assert.equal(response.status, 200, JSON.stringify(response.body));
      for (const user of response.body)
        assert.deepEqual(Object.keys(user).sort(), ['id', 'username']);
      return response.body;
    };
    const matching = (q) =>
      inserted.rows
        .filter((row) => row.username.toLowerCase().startsWith(q.toLowerCase()))
        .sort((a, b) => b.id - a.id);
    for (const q of [
      `${prefix}ALI`,
      `${prefix}100%`,
      `${prefix}!`,
      `${prefix}!!`,
      `${prefix}\\`,
    ]) {
      assert.deepEqual(await search(`  ${q}  `), matching(q));
    }
    const expected = matching(prefix);
    assert.equal((await search(prefix)).length, 25);
    assert.deepEqual(await search(prefix, '&limit=100'), expected);
    const seen = [];
    let beforeId;
    for (;;) {
      const page = await search(
        prefix,
        `&limit=4${beforeId ? `&beforeId=${beforeId}` : ''}`,
      );
      if (!page.length) break;
      seen.push(...page);
      beforeId = page.at(-1).id;
    }
    assert.deepEqual(seen, expected);
    for (const q of ['licia', '%', "' OR 1=1 --"])
      assert.deepEqual(await search(q), []);
  });

  it('rejects invalid search queries and pagination', async () => {
    for (const path of ['/search/tweets', '/search/users']) {
      for (const query of [
        '',
        '?q=',
        '?q=%20%09',
        `?q=${'a'.repeat(101)}`,
        '?q=hello&limit=101',
        '?q=hello&beforeId=-1',
      ]) {
        assert.equal(
          (await request(`${path}${query}`, { account: 'alice' })).status,
          400,
        );
      }
    }
  });

  it('rolls search indexes back and reapplies them while retaining feed indexes and data', async () => {
    const beforeCount = await db.query('SELECT COUNT(*) FROM tweets');
    migrate('db:migrate:undo');
    let indexes = await db.query(
      `SELECT indexname FROM pg_indexes WHERE tablename IN ('tweets', 'tagged_users', 'users')`,
    );
    let names = indexes.rows.map((row) => row.indexname);
    assert(names.includes('tweets_user_id_id'));
    assert(names.includes('tagged_users_user_id_tweet_id'));
    assert(!names.includes('tweets_content_search_gin'));
    assert(!names.includes('users_username_prefix'));
    const legacy = await db.query(
      `INSERT INTO tweets ("userId", content, "createdAt", "updatedAt")
      VALUES ($1, 'Existing searchable migration fixture', NOW(), NOW()) RETURNING id`,
      [accounts.alice.user.id],
    );
    migrate('db:migrate');
    indexes = await db.query(
      `SELECT indexname FROM pg_indexes WHERE tablename IN ('tweets', 'tagged_users', 'users')`,
    );
    names = indexes.rows.map((row) => row.indexname);
    assert(names.includes('tweets_user_id_id'));
    assert(names.includes('tagged_users_user_id_tweet_id'));
    assert(names.includes('tagged_users_tweet_id'));
    assert(!names.includes('tagged_users_user_id'));
    assert(names.includes('tweets_content_search_gin'));
    assert(names.includes('users_username_prefix'));
    const response = await request('/search/tweets?q=searchable%20migration', {
      account: 'alice',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.map((tweet) => tweet.id),
      [legacy.rows[0].id],
    );
    await db.query('DELETE FROM tweets WHERE id = $1', [legacy.rows[0].id]);
    assert.deepEqual(
      (await db.query('SELECT COUNT(*) FROM tweets')).rows,
      beforeCount.rows,
    );
  });

  it('rebuilds the full schema and loads the documented seed fixtures', async () => {
    migrate('db:migrate:undo:all');
    const tables = await db.query(`SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename IN ('users', 'tweets', 'tagged_users')`);
    assert.equal(tables.rowCount, 0);
    migrate('db:migrate');
    const seed = spawnSync('npm', ['run', 'db:seed:all'], {
      env,
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(seed.status, 0, `${seed.stdout}\n${seed.stderr}`);
    for (const [table, expected] of [
      ['users', 4],
      ['tweets', 20],
      ['tagged_users', 12],
    ]) {
      const count = await db.query(
        `SELECT COUNT(*)::int AS count FROM ${table}`,
      );
      assert.equal(count.rows[0].count, expected, table);
    }
    assert(
      !serverLog.includes('Executing ('),
      'SQL should not be logged in production',
    );
  });
});
