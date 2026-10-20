# Munch Twitter Clone

Simple twitter clone built with Fastify, TypeScript, and PostgreSQL. The file structure is set up similar to that of [Nestjs](https://docs.nestjs.com/).

## Development Quickstart

The app can be run using either `docker compose` (recommended) or running the server locally via `npm`.


### Using Docker Compose

The docker compose file includes a postgreSQL database server and should work out of the box with the default values:

```sh
docker compose up
```

### Using npm (node v22 or higher required)

If you prefer not using docker, set up the .env file correctly and use npm.

If you do not already have a database server running, `docker compose` can still be used for that:

```sh
docker compose up postgres-service
```

- Copy .env.example to .env and set up values

 ```sh
cp .env.example .env
 ```

- Run migrations:

 ```sh
 npm run db:migrate:dev
 ```

 - Start the development server:

 ```sh
 npm run start:dev
```


### Check if service is reachable:

```sh
curl http://localhost:3000/healthz
``` 
Expected result:
```json
{
  "status": "ok"
}
```

### Test Data

To add some test data to the database, run
```sh
npm run db:seed:all
```

### Code compliance

##### Unit testing


```sh
npm run test
```

##### PostgreSQL integration testing

The integration suite starts the real API, applies and rolls back migrations,
and checks authentication, feeds, pagination, constraints, transaction rollback,
and seed data. It rebuilds the database schema; use a dedicated test database.

```sh
sudo docker run -d --name munch-postgres-test \
  -p 127.0.0.1:55432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=munch_integration postgres:17.4

# Wait until PostgreSQL is ready, then run:
DB_HOST=127.0.0.1 DB_PORT=55432 DB_NAME=munch_integration npm run test:integration
```

##### Formatting

Run

```sh
npm run lint:check
```
to check formatting and 


```sh
npm run lint
```

to fix.

This command will add users, tweets and tagged users.

### Routes

A postman collection is included under docs [here](https://github.com/neilllandman/munch-twitter-clone/blob/main/docs/Munch%20Twitter%20Clone.postman_collection.json).

```ts
/
├── healthz (GET, HEAD)
├── auth/
│   ├── register (POST)
│   ├── login (POST)
│   └── user (GET, HEAD)
├── users/
│   └── :id
│       └── /tweets (GET, HEAD)
├── my-feed (GET, HEAD)
└── tweets (GET, HEAD, POST)```

```

### Feed pagination

`GET /tweets`, `GET /users/:id/tweets`, and `GET /my-feed` return arrays in
descending ID order. Each request returns up to 25 tweets by default. Set `limit`
to a value from 1 to 100 to change the page size.

To load older tweets, pass the last returned tweet's ID as `beforeId`, for example
`GET /tweets?beforeId=76&limit=25`. The cursor is exclusive: only IDs below 76
are returned. Continue until an empty page is returned.

Run `npm run db:migrate:dev` to apply the feed indexes to an existing database.
The new unique mention index requires existing `(userId, tweetId)` pairs to be unique.
SQL queries are logged only when `NODE_ENV !== 'production'`.

## Future considerations
- Expire JWT tokens and add refresh functionality
- Use AWS secrets manager (or similar) to store secrets and signing files
- Run lint checks and unit tests as pre-commit hook or add as github action when creating PR
