import {BigNumber, Contract, ethers} from 'ethers'
import {Configuration} from '../../src/config'

import FactoryJSON from '@uniswap/v2-core/build/UniswapV2Factory.json'
import RouterJSON from '@uniswap/v2-periphery/build/UniswapV2Router02.json'
import PairJSON from '@uniswap/v2-periphery/build/IUniswapV2Pair.json'
import {retry} from '../../src/utils'

export class Uniswap {
  private constructor(public WETH: Contract) {}

  private _factory: Contract | undefined
  private _router: Contract | undefined
  private deployedPairs: {[tokenA: string]: {[tokenB: string]: Contract}} = {}

  private async deploy() {
    const wallet = Configuration.wallet
    const factoryContract = new ethers.ContractFactory(FactoryJSON.abi, FactoryJSON.bytecode, wallet)
    this._factory = await factoryContract.deploy(wallet.getAddress())

    const routerContract = new ethers.ContractFactory(RouterJSON.abi, RouterJSON.bytecode, wallet)
    this._router = await routerContract.deploy(this._factory.address, this.WETH.address)
    return this
  }

  public static async deploy(WETH: Contract) {
    return new Uniswap(WETH).deploy()
  }

  public getPair(tokenA: Contract, tokenB: Contract): Contract | null {
    if (this.deployedPairs[tokenA.address] && this.deployedPairs[tokenA.address][tokenB.address]) {
      return this.deployedPairs[tokenA.address][tokenB.address]
    }
    if (this.deployedPairs[tokenB.address] && this.deployedPairs[tokenB.address][tokenA.address]) {
      return this.deployedPairs[tokenB.address][tokenA.address]
    }
    return null
  }

  public async addLiquidity(tokenA: Contract, tokenB: Contract, amountA: BigNumber, amountB: BigNumber) {
    let pair = this.getPair(tokenA, tokenB)
    await tokenA.approve(this.router.address, amountA)
    await tokenB.approve(this.router.address, amountB)
    await this.router.addLiquidity(
      tokenA.address,
      tokenB.address,
      amountA,
      amountB,
      BigNumber.from('1'),
      BigNumber.from('1'),
      Configuration.wallet.address,
      Uniswap.getDeadline(),
    )
    if (pair == null) {
      const pairIndex = (await this.factory.allPairsLength()) as BigNumber
      const address = await this.factory.allPairs(pairIndex.sub('1'))
      pair = new ethers.Contract(address, PairJSON.abi, Configuration.wallet)
      if (!this.deployedPairs[tokenA.address]) {
        this.deployedPairs[tokenA.address] = {}
      }
      this.deployedPairs[tokenA.address][tokenB.address] = pair
    }
    return pair
  }

  public async swapExactTokensForTokens(tokens: Array<Contract>, amountIn: BigNumber, to: string) {
    await tokens[0].approve(this.router.address, amountIn)
    return retry(() =>
      this.router.swapExactTokensForTokens(
        amountIn,
        BigNumber.from('0'),
        tokens.map(t => t.address),
        to,
        Uniswap.getDeadline(),
      ),
    )
  }

  private static getDeadline() {
    return (new Date().getTime() / 1000 + 2 * 60).toFixed(0)
  }

  get factory(): Contract {
    if (!this._factory) {
      throw new Error('Not deploy yet')
    }
    return this._factory
  }

  private get router(): Contract {
    if (!this._router) {
      throw new Error('Not deploy yet')
    }
    return this._router
  }
}
