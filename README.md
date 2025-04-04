# Munch Twitter Clone

Simple twitter clone built with Fastify, TypeScript, and PostgreSQL.

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
$ cp .env.example .env
 ```

- Run migrations:

 ```sh
 $ npm run db:migrate:dev
 ```

 - Start the development server:

 ```sh
 $ npm run start:dev
```


### Check if service is reachable:

```sh
$ curl http://localhost:3000/healthz
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
$ npm run db:seed:all
```

This command will add users, tweets and tagged users.