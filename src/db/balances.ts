import { DBPool, defaultPool } from './db-pool';
import { IToken } from './tokens';
import { Configuration } from '../config';
import { ResultSetHeader } from 'mysql2';
import { strip0x } from '../utils';

export type IBalance = {
  id: string
  token: IToken
  address: string
  balance: string
}

export class Balances {
  private static _conn: DBPool = defaultPool

  private static _tableName: string = 'balances'

  public static async count (): Promise<number> {
    const result = await this._conn.pool.query(`select count('id') from ${this._tableName}`);
    return (result as any)[0][0][0];
  }

  public static async countByTokenId (tid: string): Promise<number> {
    const result = await this._conn.pool.query(`select count('id') from ${this._tableName} where tid=? limit 1`, [tid]);
    return (result as any)[0][0][0];
  }

  public static async queryBalance (tid: string, address: string): Promise<string> {
    const result = await this._conn.pool.query(
      `select balance from ${this._tableName} where tid=? and address=? limit 1`,
      [tid, address],
    );
    return (result as any)[0][0][0];
  }

  public static async queryAddress (tid: string, limit: number, offset: number): Promise<Array<string>> {
    const sql = `select address from ${this._tableName} where tid=? limit ? offset ?`;
    const result = await this._conn.pool.query(sql, [tid, limit, offset]);
    return (result as any)[0].flatMap((r: any) => r[0]);
  }

  public static async addBalance (balances: Array<{address: string; tid: string; balance: string}>) {
    if (balances.length === 0) {
      return;
    }
    const sql = `insert ignore into ${this._tableName} (tid, address, balance) values ${new Array(balances.length)
      .fill('(?,?,?)')
      .join(',')}`;
    const startAt = new Date().getTime();
    const result = (
      await this._conn.pool.query(
        sql,
        balances.flatMap(balance => {
          return [balance.tid, strip0x(balance.address), balance.balance];
        }),
      )
    )[0] as ResultSetHeader;
    const endAt = new Date().getTime();
    Configuration.logger.debug('Insert Balances: %d  %s Time: %dms', balances.length, result.info, endAt - startAt);
  }

  public static async updateBalances (balances: Array<{address: string; tid: string; balance: string}>) {
    const sql = `insert into ${this._tableName} (tid, address, balance) values (?,?,?) on duplicate key update balance=?;`;
    const startAt = new Date().getTime();
    await Promise.all(
      balances.map(balance => {
        return this._conn.pool.query(sql, [balance.tid, strip0x(balance.address), balance.balance, balance.balance]);
      }),
    );
    const endAt = new Date().getTime();
    Configuration.logger.debug('Update Balances: %d, Time: %dms', balances.length, endAt - startAt);
  }
}
