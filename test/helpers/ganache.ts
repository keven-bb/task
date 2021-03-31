import Ganache from 'ganache-core';
import { Configuration } from '../../src/config';

export class GanacheFixture {
  private static server?: Ganache.Server

  public static start () {
    return new Promise((resolve, reject) => {
      this.server = Ganache.server({
        mnemonic: Configuration.ganacheMnemonic,
        default_balance_ether: Configuration.ganacheBalance,
        debug: true,
      });
      this.server.listen(Configuration.ganachePort)
      ;(this.server as Ganache.Server)
        .once('listening', () => {
          resolve(null);
        })
        .once('error', err => {
          reject(err);
        });
    });
  }

  public static stop () {
    return new Promise((resolve, reject) => {
      if (this.server === undefined) {
        reject(new Error('Ganache has not start yet.'));
      }
      ;(this.server as Ganache.Server).close(err => {
        if (err) {
          reject(err);
        } else {
          resolve(null);
        }
      });
    });
  }
}
