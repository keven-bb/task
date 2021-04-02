import { BigNumber, Contract, utils } from 'ethers';
import ERC20JSON from './erc20.json';
import { Configuration } from './config';
import BigNumberJs from 'bignumber.js';
import { PairCreatedCollect, SwapCollect } from './transfer-collect';
import PairJSON from '@uniswap/v2-periphery/build/IUniswapV2Pair.json';
import { Log, TransactionReceipt, TransactionResponse } from '@ethersproject/abstract-provider';
import { Price } from './price';
import { Result } from 'ethers/lib/utils';

type SwapEventArgs = {
  sender: string,
  amount0In: BigNumber,
  amount1In: BigNumber,
  amount0Out: BigNumber,
  amount1Out: BigNumber,
  to: string,
}

const defaultHoldAndCost = () => ({ hold: new BigNumberJs(0), cost: new BigNumberJs(0), decimals: '0' });

export class Cost {
  private readonly token: Contract;
  private readonly client: string;

  constructor (
    client: string,
    token: string,
    private getPrice: (token: Contract, timestamp: number) => Promise<BigNumberJs> = Price.getPrice.bind(Price),
  ) {
    this.token = new Contract(token.toLowerCase(), ERC20JSON.abi, Configuration.provider);
    this.client = client.toLowerCase();
  }

  public async start () {
    const latest = await Configuration.provider.getBlockNumber();

    // 收集所有交易对
    const pairs = await this.getPairs(this.token, latest);
    Configuration.logger.debug(`Got ${pairs.length} pairs`);
    if (pairs.length === 0) {
      return defaultHoldAndCost();
    }
    // 收集所有相关的事件发生的交易hash
    const txHashes = (await Promise.all(pairs.map(pair => this.getSwapEvents(pair, this.token, latest))))
      .flatMap(events => events)
      .map(({ transactionHash }) => transactionHash);
    Configuration.logger.debug(`Got ${txHashes.length} swap events`);
    if (txHashes.length === 0) {
      return defaultHoldAndCost();
    }

    // 收集每一次交易得到的持有量和成本
    const holdAndCosts = (await Promise.all(txHashes.map(hash => this.getHoldAndCostFrom(hash))))
      // 计算所有交易，得到总持有量和总成本
      .reduce<{ hold: BigNumberJs, cost: { [key: string]: BigNumberJs } }>(
        (acc, { hold, cost, decimals }) => {
          if (!cost.eq(0)) {
            acc.cost[decimals] = cost.plus(acc.cost[decimals] ? acc.cost[decimals] : 0);
          }
          return {
            hold: acc.hold.plus(hold),
            cost: acc.cost,
          };
        }, {
          hold: new BigNumberJs(0),
          cost: {},
        },
      );

    return {
      hold: holdAndCosts.hold,
      cost: Object.entries(holdAndCosts.cost).reduce((acc, [decimals, cost]) => {
        return acc.plus(cost.div(new BigNumberJs(10).pow(decimals)));
      }, new BigNumberJs(0)),
    };
  }

  private async getHoldAndCostFrom (txHash: string) {
    const txs = await Promise.all([
      Configuration.provider.getTransaction(txHash),
      Configuration.provider.getTransactionReceipt(txHash),
    ]);

    const [{ to }] = txs;
    if (to !== Configuration.router.address) {
      // 并非用户直接在uniswap上swap
      return defaultHoldAndCost();
    }

    return this.getHoldAndCost(...txs);
  }

  private async getPairs (token: Contract, latest: number) {
    const pairCreatedCollect = new PairCreatedCollect(Configuration.factory, Configuration.factoryDeployBlock, latest);
    const pairCreatedEvents = (await Promise.all([
      pairCreatedCollect.getEvents([token.address, null], latest - Configuration.factoryDeployBlock + 1, 100),
      pairCreatedCollect.getEvents([null, token.address], latest - Configuration.factoryDeployBlock + 1, 100),
    ]));
    return pairCreatedEvents.flatMap(
      ({ events }) =>
        events.map(
          ({ blockNumber, args }) => {
            const { token0, token1, pair } = args as unknown as { token0: string, token1: string, pair: string };
            return {
              token0: new Contract(token0, ERC20JSON.abi, Configuration.provider),
              token1: new Contract(token1, ERC20JSON.abi, Configuration.provider),
              contract: new Contract(pair.toLocaleLowerCase(), PairJSON.abi, Configuration.provider),
              deployBlock: blockNumber,
            };
          }),
    );
  }

  private async getSwapEvents (pair: { contract: Contract, deployBlock: number }, token: Contract, latest: number) {
    const swapCollect = new SwapCollect(
      pair.contract,
      pair.deployBlock,
      latest,
    );
    const result = await swapCollect.getEvents([null, null, null, null, null, this.client], pair.deployBlock, latest);
    return result.events;
  }

  private async getHoldAndCost (
    {
      blockNumber,
      data,
      value,
    }: TransactionResponse,
    {
      logs,
    }: TransactionReceipt,
  ) {
    const transactionDescription = Configuration.router.interface.parseTransaction({ data, value });

    const path = transactionDescription.args.path as Array<string>;
    const fromToken = new Contract(path[0].toLowerCase(), ERC20JSON.abi, Configuration.provider);
    const toToken = new Contract(path[path.length - 1].toLowerCase(), ERC20JSON.abi, Configuration.provider);
    if (fromToken.address !== this.token.address && toToken.address !== this.token.address) {
      Configuration.logger.debug(`swap from ${path[0]} to ${path[path.length - 1]}, ${this.token.address} is either the source or target token`);
      return defaultHoldAndCost();
    }

    // 获得pair及其swap事件
    const pairPath = await this.getPairAndEvents(logs, path);

    const firstPair = pairPath[0];
    const { amount0In, amount1In } = firstPair.event.args as Result | SwapEventArgs;
    const amountIn = fromToken.address === (await firstPair.contract.token0()).toLowerCase() ? amount0In : amount1In;

    const lastPair = pairPath[pairPath.length - 1];
    const { amount0Out, amount1Out } = lastPair.event.args as Result | SwapEventArgs;
    const amountOut = toToken.address === (await lastPair.contract.token0()).toLowerCase() ? amount0Out : amount1Out;

    const { timestamp } = await Configuration.provider.getBlock(blockNumber as number);

    return fromToken.address === this.token.address
      ? this.getResult(toToken, timestamp, amountOut, amountIn, false)
      : this.getResult(fromToken, timestamp, amountIn, amountOut, true);
  }

  private async getPairAndEvents (logs: Array<Log>, path: Array<string>) {
    const eventAndAddress = logs
      // 过滤所有非Swap事件
      .filter(({ topics: [name] }) => name === utils.id('Swap(address,uint256,uint256,uint256,uint256,address)'))
      // 将Swap事件与发出事件的合约绑定到一起
      .map(
        (log) => ({
          address: log.address.toLowerCase(),
          event: new utils.Interface(PairJSON.abi).parseLog(log),
        }),
      );
    return (await Promise.all(
      // 获得swap路径下对应的pair合约
      path
        .slice(0, path.length - 1)
        .map(
          async (p, index) => (await Configuration.factory.getPair(p, path[index + 1])).toLowerCase(),
        ),
    ))
      // 将pair合约与事件绑定在一起
      .map((pairAddress) => {
        const event = eventAndAddress.find(({ address }) => pairAddress === address);
        if (!event) {
          throw new Error('no swap event emitted!');
        }
        return {
          contract: new Contract(pairAddress, PairJSON.abi, Configuration.provider),
          event: event.event,
        };
      });
  }

  private async getResult (token: Contract, timestamp: number, hold: BigNumber, cost: BigNumber, isSwapIn: boolean) {
    const price = await this.getPrice(token, timestamp);
    if (price.eq('0')) {
      Configuration.logger.debug('No price exists');
      return defaultHoldAndCost();
    }
    const decimals = await token.decimals() as BigNumber;
    return {
      hold: new BigNumberJs(cost.toString()).multipliedBy(isSwapIn ? 1 : -1),
      cost: new BigNumberJs(hold.toString()).multipliedBy(price).multipliedBy(isSwapIn ? 1 : -1),
      decimals: decimals.toString(),
    };
  }
}
