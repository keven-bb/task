// @ts-ignore
import CoinGecko from 'coingecko-api';
import BigNumberJs from 'bignumber.js';
import { Contract } from 'ethers';
import { formatDate, timestampToDateTimestamp } from './utils';

export class Price {
  private static coinGecko = new CoinGecko();
  private static symbolToId: { [key: string]: string } = {}
  // address => timestamp => price
  private static addressToPrice: { [key: string]: { [key: number]: BigNumberJs } } = {}

  public static async init () {
    const list = await this.coinGecko.coins.list();
    if (!list.success) {
      throw new Error('init CoinGecko failed');
    }
    const coins: { id: string, symbol: string }[] = list.data;
    this.symbolToId = coins.reduce<{ [key: string]: string }>((acc, coin) => {
      acc[coin.symbol] = coin.id;
      return acc;
    }, {});
  }

  public static async getPrice (token: Contract, timestamp: number) {
    const id = await this.getId(token);
    timestamp = timestampToDateTimestamp(timestamp);
    if (id === null) {
      this.putIntoMemo(token, timestamp, 0);
    } else {
      const price = await this.fetchPrice(timestamp, id);
      this.putIntoMemo(token, timestamp, price);
    }
    return this.addressToPrice[token.address][timestamp];
  }

  private static putIntoMemo (token: Contract, timestamp: number, price: number) {
    if (!this.addressToPrice[token.address]) {
      this.addressToPrice[token.address] = {};
    }
    this.addressToPrice[token.address][timestamp] = new BigNumberJs(price);
  }

  private static async fetchPrice (timestamp: number, id: string) {
    const date = formatDate(timestamp);
    const result = await this.coinGecko.coins.fetchHistory(id, { date, localization: false });
    if (!result.success) {
      throw new Error(`fetch ${id} price fail`);
    }
    return result.data.market_data.current_price.usd;
  }

  private static async getId (token: Contract) {
    const symbol = await token.symbol();
    return this.symbolToId[symbol.toLowerCase()];
  }
}
