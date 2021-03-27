import {Contract} from 'ethers'
import {Configuration} from './config'
import {abi} from '../src/erc20.json'
import {Collector} from './collector'
import {extractTransferAddress, getBalances} from './utils'
import {IToken, Tokens} from './db/tokens'
import {Balances} from './db/balances'

export class Holder {
  private token: IToken
  private readonly contract: Contract
  private from: number
  private readonly to: number

  constructor(token: IToken, from: number, to: number) {
    this.token = token
    this.contract = new Contract(token.address, abi, Configuration.provider)
    this.from = from
    this.to = to
  }

  public async addAddress() {
    while (this.from < this.to) {
      const next = this.getNext()
      const collector = new Collector(this.contract, this.from, next)
      const eventResult = await collector.getEvents()
      const addresses = extractTransferAddress(eventResult)
      await Balances.addBalance(addresses.addresses.map(address => ({tid: this.token.id, address, balance: '0'})))
      await Tokens.updateToken(this.token, this.to)
      this.token = await Tokens.getTokenById(this.token.id)
      this.from += Configuration.collectBatch
    }
  }

  public async updateBalance() {
    while (this.from < this.to) {
      const next = this.getNext()
      const collector = new Collector(this.contract, this.from, next)
      const eventResult = await collector.getEvents()
      const addresses = extractTransferAddress(eventResult)
      const balances = await getBalances(this.token.address, addresses.addresses)
      await Balances.updateBalances(balances.map(balance => ({...balance, tid: this.token.id})))
      this.from += Configuration.collectBatch
    }
  }

  private getNext() {
    return this.from + Configuration.collectBatch > this.to ? this.to : this.from + Configuration.collectBatch - 1
  }

  public async updateBalanceInDB() {
    Configuration.logger.debug('start update balance of addresses in database')
    const total = await Balances.countByTokenId(this.token.id)
    const limit = 2000
    for (let i = 0; i < total; i += limit) {
      const addresses = await Balances.queryAddress(this.token.id, limit, i)
      const balances = await getBalances(this.token.address, addresses)
      await Balances.updateBalances(balances.map(balance => ({...balance, tid: this.token.id})))
    }
  }
}
