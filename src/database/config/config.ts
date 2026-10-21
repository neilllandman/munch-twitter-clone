import { Options } from 'sequelize';
import { environment } from '../../config/environment';

const connectionOptions: Options = {
  dialect: 'postgres',
  ...environment.database,
  logging: environment.production ? false : console.log,
  pool: { acquire: 5000 },
  dialectOptions: { connectionTimeoutMillis: 5000 },
};

// Use `exports =` syntax for compatibility with sequelize-cli
export = connectionOptions;
