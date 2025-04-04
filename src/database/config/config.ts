import { Options } from 'sequelize';

const connectionOptions: Options = {
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'twitter_clone',
  logging: console.log,
};

// Use `exports =` syntax for compatibility with sequelize-cli
export = connectionOptions;
