# Before/after performance results

Measured locally on 20 October 2026 using PostgreSQL 17.4 in Docker, Node 22.23.1,
an Intel i7-13650HX (10 logical CPUs available), and approximately 7.6 GiB RAM.
Client, API, and database shared the host. These are local comparisons, not
production capacity estimates or statistical confidence intervals.

## Versions and data

- Original source: `2dad917`, before any fixes in this conversation.
- Optimizations without response schemas: `4042e80`.
- Current source: `2b4dd87`.
- Large fixture: 1,000 users, 100,000 tweets, and 71,633 mention associations.
- Separate databases had identical initial data. Only the optimized database
  received the new indexes. Write tests ran after all read tests.
- All snapshots used the same installed dependencies: Fastify 5.8.5,
  `@fastify/jwt` 10.1.0, Sequelize 6.37.8, and pg 8.21.0. This measures application
  changes, rather than historical dependency upgrades.
- Sources were transpiled identically without type checking. This avoids the
  baseline's existing logger type errors without changing its source.
- Baseline table definitions and original indexes were recreated directly with
  SQL, bypassing the original migration's missing commit. No baseline route or
  query code was patched.
- `NODE_ENV=production`; original SQL logging remained enabled, while current
  SQL logging was disabled by the optimization. Application logs went to files
  for both versions.

## Actual default endpoint behavior

Two concurrent clients, one-second warmup, three rounds of at least two seconds.
In-flight requests were allowed to complete; a request timed out after ten
seconds of socket inactivity. Figures are medians across rounds. p50 is the
median request latency within a round.

| Endpoint | Original p50 | Current p50 | Original successful req/s | Current successful req/s | Original response | Current response |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `GET /tweets` | 3,239 ms | 3.15 ms | 0.62 | 589 | 34,245,691 bytes | 8,581 bytes |
| `GET /my-feed` | 174 ms | 3.54 ms | 11.5 | 542 | 1,758,325 bytes | 8,581 bytes |
| `GET /users/1/tweets` | HTTP 500 | 3.59 ms | 0 | 536 | Error | 9,156 bytes |

The first two rows compare different amounts of work. The original API returns
every matching tweet; the current API returns 25. Most of the dramatic change
comes from pagination. This does **not** show an equal-work thousandfold speedup.
The original `/tweets` measurement contains only six successful measured
requests because each is so expensive; its tail latency estimate is unreliable.

The original user-timeline route fails with `SequelizeEagerLoadingError` because
its include omits the `taggedUsers` alias. Its fast error responses are excluded
from successful throughput. This also invalidates the attempted 100-post user
timeline comparison in `results.json`.

## Equal-work and schema-only comparisons

These follow-up tests use eight concurrent clients, eight-second warmups per
version, and six two-second rounds. Both servers stay running during each paired
comparison. A/B and B/A order alternates between rounds. Figures are medians
across rounds; the even-numbered medians average the two central values.

For the original/current comparison, a separate fixture contains exactly 100
tweets. Both versions return all 100 tweets and exactly 33,361 response bytes.
The original ignores `limit=100`; the current version honors it.

| Comparison | Before successful req/s | After successful req/s | Change | Before p50 | After p50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original vs current, same 100-post `/tweets` response | 448 | 495 | +10.6% | 17.19 ms | 15.85 ms |
| Without vs with schemas, `/tweets?limit=25` | 1,247 | 1,340 | +7.5% | 6.25 ms | 5.75 ms |
| Without vs with schemas, `/my-feed?limit=25` | 961 | 1,070 | +11.3% | 7.84 ms | 7.28 ms |
| Without vs with schemas, `/users/1/tweets?limit=25` | 837 | 883 | +5.5% | 9.22 ms | 8.64 ms |

Schema comparisons use the large fixture, identical indexes, identical query
code, and identical response byte counts. The source difference is the response
schemas and their route registration. No measured request failed in these tests.

The schema gains are modest, and individual rounds vary. Schemas were slower in
two of six paired `/tweets` rounds and two of six personal-feed rounds. They were
faster in all six user-timeline rounds. Treat the percentages as observations
from this run, not guaranteed improvements. The initial short-warmup run even
showed a small user-timeline regression, which motivated the controlled follow-up.

## Mention creation and concurrency

These initial tests use the same short-warmup procedure as the default endpoint
tests. Every request posts `Benchmark post @user2 @user3` as user 1. Both versions
write one tweet and two mention rows and return 143 response bytes.

| Concurrent clients | Original successful req/s | Current successful req/s | Original p50 | Current p50 |
| --- | ---: | ---: | ---: | ---: |
| 1 | 136 | 167 | 6.94 ms | 5.92 ms |
| 8 | 0; all 24 measured requests timed out | 608; zero failures | No successes | 12.81 ms |

The concurrent baseline failure is consistent with connection-pool starvation:
each write holds a transaction connection, then requests another connection for
the mention lookup. Passing the transaction to the lookup allows current writes
to finish using their existing connections. Timed-out requests are counted as
failures; they are not silently dropped from the results.

## Reproduction and artifacts

The scripts create fresh `bench_*` databases in a dedicated container and extract
Git snapshots into temporary directories. They leave the working tree's
application source unchanged. Ports 55300–55302 must be available for the APIs.
The installed dependencies must be present (`npm ci`).

```sh
sudo docker run -d --name munch-postgres-benchmark-20261020 \
  -p 127.0.0.1:55432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=munch_benchmark postgres:17.4

# Wait for PostgreSQL readiness before running these sequentially.
DB_PORT=55432 node benchmarks/performance.cjs
DB_PORT=55432 node benchmarks/controlled.cjs

sudo docker rm -f -v munch-postgres-benchmark-20261020
```

- `results.json`: initial default behavior, equal-timeline attempt, schema, and write results.
- `controlled-results.json`: longer-warmup alternating comparisons, including every round.
- `performance.cjs` and `controlled.cjs`: repeatable benchmark drivers and fixture generation.

The benchmark container and its data volume were removed after measurement.
