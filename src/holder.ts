import { Contract } from 'ethers';
import { Configuration } from './config';
import { abi } from '../src/erc20.json';
import { TransferCollect } from './transfer-collect';
import { extractTransferAddress, getBalances } from './utils';
import { IToken, Tokens } from './db/tokens';
import { Balances } from './db/balances';

export class Holder {
  private token: IToken
  private readonly contract: Contract
  private from: number
  private readonly to: number

  constructor (token: IToken, from: number, to: number) {
    this.token = token;
    this.contract = new Contract(token.address, abi, Configuration.provider);
    this.from = from;
    this.to = to;
  }

  public async addAddress () {
    const startAt = new Date().getTime();
    let count = 0;
    const from = this.from;
    while (this.from < this.to) {
      const next = this.getNext();
      const collector = new TransferCollect(this.contract, this.from, next);
      const eventResult = await collector.getEvents();
      const addresses = extractTransferAddress(eventResult);
      count += addresses.addresses.length;
      await Balances.addBalance(addresses.addresses.map(address => ({ tid: this.token.id, address, balance: '0' })));
      await Tokens.updateToken(this.token, this.to);
      this.token = await Tokens.getTokenById(this.token.id);
      this.from += Configuration.collectBatch;
    }
    Configuration.logger.debug(
      'Got %d addresses from %d to %d with %d ms',
      count,
      from,
      this.to,
      new Date().getTime() - startAt,
    );
  }

  public async updateBalance () {
    while (this.from < this.to) {
      const next = this.getNext();
      const collector = new TransferCollect(this.contract, this.from, next);
      const eventResult = await collector.getEvents();
      const addresses = extractTransferAddress(eventResult);
      const balances = await getBalances(this.token.address, addresses.addresses);
      await Balances.updateBalances(balances.map(balance => ({ ...balance, tid: this.token.id })));
      this.from += Configuration.collectBatch;
    }
  }

  private getNext () {
    return this.from + Configuration.collectBatch > this.to ? this.to : this.from + Configuration.collectBatch - 1;
  }

  public async updateBalanceInDB () {
    Configuration.logger.debug('start update balance of addresses in database');
    const total = await Balances.countByTokenId(this.token.id);
    const limit = Configuration.collectLimit;
    for (let i = 0; i < total; i += limit) {
      const addresses = await Balances.queryAddress(this.token.id, limit, i);
      const balances = await getBalances(this.token.address, addresses);
      await Balances.updateBalances(balances.map(balance => ({ ...balance, tid: this.token.id })));
    }
  }
}
