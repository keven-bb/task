import { DBPool, defaultPool } from './db-pool';
import { Configuration } from '../config';
import { ResultSetHeader } from 'mysql2';
import { add0x, strip0x } from '../utils';

export type IToken = {
  id: string
  address: string
  current: number
}

export class Tokens {
  private static _conn: DBPool = defaultPool

  private static _tableName: string = 'tokens'

  public static async updateToken (token: IToken, current: number): Promise<boolean> {
    const sql = `update ${this._tableName} set current=? where id=?`;
    let [result] = await this._conn.pool.query(sql, [current, token.id]);
    result = result as ResultSetHeader;
    Configuration.logger.debug('update token %s, current: %d', token.address, current);
    return result.affectedRows === 1;
  }

  public static async getTokenById (tid: string): Promise<IToken> {
    const sql = `select * from ${this._tableName} where id=?;`;
    let [result] = await this._conn.pool.query(sql, [tid]);
    result = result as Array<Array<any>>;
    if (result.length === 0) {
      throw new Error(`Token(id=${tid}) not exists!`);
    }
    const [id, address, current] = result[0] as any;
    return { id, address: add0x(address), current };
  }

  public static async getTokenByAddress (address: string): Promise<IToken> {
    address = strip0x(address);
    const sql = `select * from ${this._tableName} where address=?;`;
    let [result] = await this._conn.pool.query(sql, [address]);
    result = result as Array<Array<any>>;
    if (result.length === 0) {
      throw new Error(`Token(address=${address}) not exists!`);
    }
    const [id, , current] = result[0] as any;
    return { id, address: add0x(address), current };
  }

  public static async addToken (address: string, current: number): Promise<IToken> {
    address = strip0x(address);

    const querySql = 'select *from tokens where address = ?';
    let [result] = await this._conn.pool.query(querySql, address);
    result = result as Array<Array<any>>;
    if (result.length > 0) {
      let [id, address, current] = result[0] as any;
      address = add0x(address);
      Configuration.logger.debug('Token %s exists, id: %d, current: %d', address, id, current);
      return {
        id,
        address: add0x(address),
        current,
      };
    }

    await this._conn.pool.query(`insert into ${this._tableName} (address, current) values (?, ?);`, [address, current]);
    return this.addToken(address, current);
  }

  public static async count (): Promise<number> {
    const result = await this._conn.pool.query(`select count('id') from ${this._tableName}`);
    return (result as any)[0][0][0];
  }
}
