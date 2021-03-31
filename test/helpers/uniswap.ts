import { BigNumber, Contract, ethers } from 'ethers';
import { Configuration } from '../../src/config';
import FactoryJSON from '@uniswap/v2-core/build/UniswapV2Factory.json';
import RouterJSON from '@uniswap/v2-periphery/build/UniswapV2Router02.json';
import PairJSON from '@uniswap/v2-periphery/build/IUniswapV2Pair.json';
import { retry } from '../../src/utils';
import { TransactionResponse } from '@ethersproject/abstract-provider';

export class Uniswap {
  private _factory: Contract | undefined
  private _router: Contract | undefined
  private deployedPairs: { [tokenA: string]: { [tokenB: string]: Contract } } = {}

  private async deploy (WETH: Contract) {
    const factoryContract = new ethers.ContractFactory(FactoryJSON.abi, FactoryJSON.bytecode, Configuration.wallet);
    this._factory = await factoryContract.deploy(Configuration.wallet.getAddress());
    Configuration.factoryAddress = this._factory.address;
    const { blockNumber: factoryDeployBlock } = await Configuration.provider.getTransactionReceipt(this._factory.deployTransaction.hash);
    Configuration.factoryDeployBlock = factoryDeployBlock;

    const routerContract = new ethers.ContractFactory(RouterJSON.abi, RouterJSON.bytecode, Configuration.wallet);
    this._router = await routerContract.deploy(this._factory.address, WETH.address);
    Configuration.routerAddress = this._router.address;
    const { blockNumber: routerDeployBlock } = await Configuration.provider.getTransactionReceipt(this._router.deployTransaction.hash);
    Configuration.routerDeployBlock = routerDeployBlock;
    return this;
  }

  public static async deploy (WETH: Contract) {
    return new Uniswap().deploy(WETH);
  }

  public getPair (tokenA: Contract, tokenB: Contract): Contract | null {
    if (this.deployedPairs[tokenA.address] && this.deployedPairs[tokenA.address][tokenB.address]) {
      return this.deployedPairs[tokenA.address][tokenB.address];
    }
    return null;
  }

  public async addLiquidity (tokenA: Contract, tokenB: Contract, amountA: BigNumber, amountB: BigNumber) {
    let pair = this.getPair(tokenA, tokenB);
    await tokenA.approve(this.router.address, amountA);
    await tokenB.approve(this.router.address, amountB);
    await this.router.addLiquidity(
      tokenA.address,
      tokenB.address,
      amountA,
      amountB,
      BigNumber.from('1'),
      BigNumber.from('1'),
      Configuration.wallet.address,
      Uniswap.getDeadline(),
    );
    if (pair == null) {
      const pairIndex = (await this.factory.allPairsLength()) as BigNumber;
      const address = await this.factory.allPairs(pairIndex.sub('1'));
      pair = new ethers.Contract(address, PairJSON.abi, Configuration.wallet);
      if (!this.deployedPairs[tokenA.address]) {
        this.deployedPairs[tokenA.address] = {};
      }
      this.deployedPairs[tokenA.address][tokenB.address] = pair;
      if (!this.deployedPairs[tokenB.address]) {
        this.deployedPairs[tokenB.address] = {};
      }
      this.deployedPairs[tokenB.address][tokenA.address] = pair;
    }
    return pair;
  }

  public async swapExactTokensForTokens (tokens: Array<Contract>, amountIn: BigNumber, to: string): Promise<TransactionResponse> {
    await tokens[0].approve(this.router.address, amountIn);
    return retry(() =>
      this.router.swapExactTokensForTokens(
        amountIn,
        BigNumber.from('0'),
        tokens.map(t => t.address),
        to,
        Uniswap.getDeadline(),
      ),
    );
  }

  private static getDeadline () {
    return (new Date().getTime() / 1000 + 2 * 60).toFixed(0);
  }

  get factory (): Contract {
    if (!this._factory) {
      throw new Error('Not deploy yet');
    }
    return this._factory;
  }

  private get router (): Contract {
    if (!this._router) {
      throw new Error('Not deploy yet');
    }
    return this._router;
  }

  public async getSwapEvent (tokenA:Contract, tokenB:Contract, to:string) {
    const pair = this.getPair(tokenA, tokenB);
    if (!pair) {
      throw new Error('pair not exist!');
    }
    return pair.queryFilter(
      pair.filters.Swap(null, null, null, null, null, to),
      0,
      await Configuration.provider.getBlockNumber(),
    );
  }
}
