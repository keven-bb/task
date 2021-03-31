import { createPool, PoolOptions } from 'mysql2';
import { Configuration } from '../config';

export class DBPool {
  public pool

  constructor (options: PoolOptions) {
    options.rowsAsArray = true;
    this.pool = createPool(options).promise();
  }
}

export const defaultPool = new DBPool({
  user: Configuration.dbUser,
  password: Configuration.dbPassword,
  host: Configuration.dbHost,
  port: Configuration.dbPort,
  database: Configuration.database,
});
