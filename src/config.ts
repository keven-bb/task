import {Provider} from '@ethersproject/providers'
import config from 'config'
import {ethers} from 'ethers'
import {debug, Debugger} from 'debug'

export class Configuration {
  private static _provider: Provider
  private static _ganachePort: number
  private static _ganacheMnemonic: string
  private static _ganacheBalance: number
  private static _blocks: number
  private static _requests: number
  private static _logger: {debug: Debugger; info: Debugger; error: Debugger}

  public static get interval(): number {
    return config.get('collect.interval')
  }

  public static get provider(): Provider {
    if (!this._provider) {
      switch (config.get('eth.type')) {
        case 'ganache':
          this._provider = new ethers.providers.JsonRpcProvider(config.get('eth.host'))
          break
        case 'infura':
          this._provider = new ethers.providers.InfuraProvider(config.get('eth.chainId'), config.get('eth.apiKey'))
          break
      }
    }
    return this._provider
  }

  public static get collectBatch(): number {
    return config.get('collect.batch')
  }

  public static get wallet(): ethers.Wallet {
    return ethers.Wallet.fromMnemonic(this.ganacheMnemonic).connect(this.provider)
  }

  public static get ganachePort(): number {
    this._ganachePort = this._ganachePort || config.get('ganache.port')
    return this._ganachePort
  }

  public static set ganachePort(port: number) {
    this._ganachePort = port
  }

  public static get ganacheMnemonic(): string {
    this._ganacheMnemonic = this._ganacheMnemonic || config.get('ganache.mnemonic') || ''
    return this._ganacheMnemonic
  }

  public static set ganacheMnemonic(mnemonic: string) {
    this._ganacheMnemonic = mnemonic
  }

  public static get ganacheBalance(): number {
    this._ganacheBalance = this._ganacheBalance || config.get('ganache.balance')
    return this._ganacheBalance
  }

  public static set ganacheBalance(balance: number) {
    this._ganacheBalance = balance
  }

  public static get collectBlocks() {
    this._blocks = this._blocks || config.get('collect.blocks')
    return this._blocks
  }

  public static set collectBlocks(steps: number) {
    this._blocks = steps
  }

  public static get retry(): number {
    return config.get('eth.retry')
  }

  static get collectRequests(): number {
    this._requests = this._requests || config.get('collect.requests')
    return this._requests
  }

  static set collectRequests(value: number) {
    this._requests = value
  }

  public static get dbUser(): string {
    return config.get('db.user')
  }

  public static get dbPassword(): string {
    return config.get('db.password')
  }

  public static get dbHost(): string {
    return config.get('db.host')
  }

  public static get dbPort(): number {
    return config.get('db.port')
  }

  public static get database(): string {
    return config.get('db.database')
  }

  public static get logger() {
    if (!this._logger) {
      this._logger = {
        debug: debug('debug'),
        info: debug('info'),
        error: debug('error'),
      }
    }
    return this._logger
  }
}
