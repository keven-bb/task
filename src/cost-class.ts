import { BigNumber, Contract, utils } from 'ethers';
import ERC20JSON from './erc20.json';
import { Configuration } from './config';
import BigNumberJs from 'bignumber.js';
import { PairCreatedCollect, SwapCollect } from './transfer-collect';
import PairJSON from '@uniswap/v2-periphery/build/IUniswapV2Pair.json';
import { TransactionReceipt, TransactionResponse } from '@ethersproject/abstract-provider';
import { LogDescription } from 'ethers/lib/utils';
import { Price } from './price';

export class Cost {
  private readonly token: Contract;
  private readonly client: string;

  constructor (
    client: string,
    token: string,
    private getPrice: (token:Contract, timestamp:number)=>Promise<BigNumberJs> = Price.getPrice.bind(Price),
  ) {
    this.token = new Contract(token.toLowerCase(), ERC20JSON.abi, Configuration.provider);
    this.client = client.toLowerCase();
  }

  public async start () {
    const latest = await Configuration.provider.getBlockNumber();
    const pairs = await this.getPairs(this.token, latest);
    Configuration.logger.debug(`Got ${pairs.length} pairs`);
    if (pairs.length === 0) {
      return { hold: new BigNumberJs(0), cost: new BigNumberJs(0) };
    }
    const events = (await Promise.all(pairs.map(pair => this.getSwapEvents(pair, this.token, latest))))
      .flatMap(events => events);
    Configuration.logger.debug(`Got ${events.length} swap events`);
    if (events.length === 0) {
      return { hold: new BigNumberJs(0), cost: new BigNumberJs(0) };
    }
    const txAndTxReceipts = (await Promise.all(
      events.map(({ transactionHash }) => Cost.getTxAndTxReceipt(transactionHash)),
    )).filter(({ tx: { to } }) => to === Configuration.router.address);
    Configuration.logger.debug(`Got ${txAndTxReceipts.length} txs`);
    if (txAndTxReceipts.length === 0) {
      return { hold: new BigNumberJs(0), cost: new BigNumberJs(0) };
    }
    const holdAndCosts = await Promise.all(txAndTxReceipts
      .map(({ tx, txReceipt }) => this.getHoldAndCost(tx, txReceipt)));
    return holdAndCosts.reduce<{ hold: BigNumberJs, cost: BigNumberJs }>(({
      hold: accHold,
      cost: accCost,
    }, { hold, cost }) => {
      return {
        hold: accHold.plus(hold),
        cost: accCost.plus(cost),
      };
    }, {
      hold: new BigNumberJs(0),
      cost: new BigNumberJs(0),
    });
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

  private static async getTxAndTxReceipt (txHash: string) {
    return {
      tx: await Configuration.provider.getTransaction(txHash),
      txReceipt: await Configuration.provider.getTransactionReceipt(txHash),
    };
  }

  private async getHoldAndCost ({
    blockNumber,
    data,
    value,
  }: TransactionResponse, { logs }: TransactionReceipt): Promise<{ hold: BigNumberJs, cost: BigNumberJs }> {
    const transactionDescription = Configuration.router.interface.parseTransaction({ data, value });
    const {
      name,
      args,
    } = transactionDescription;
    const path = args.path as Array<string>;
    const fromToken = new Contract(path[0].toLowerCase(), ERC20JSON.abi, Configuration.provider);
    const toToken = new Contract(path[path.length - 1].toLowerCase(), ERC20JSON.abi, Configuration.provider);
    if (fromToken.address !== this.token.address && toToken.address !== this.token.address) {
      Configuration.logger.debug(`swap from ${path[0]} to ${path[path.length - 1]}, ${this.token.address} is either the source or target token`);
      return {
        hold: new BigNumberJs(0),
        cost: new BigNumberJs(0),
      };
    }
    const eventAndAddress = logs.filter(({ topics: [name] }) => name === utils.id('Swap(address,uint256,uint256,uint256,uint256,address)'))
      .map(
        (log) => ({
          address: log.address.toLowerCase(),
          event: new utils.Interface(PairJSON.abi).parseLog(log),
        }),
      );
    const pairPath = (await Promise.all(
      path.slice(0, path.length - 1)
        .map(
          async (p, index) => (await Configuration.factory.getPair(p, path[index + 1])).toLowerCase(),
        ),
    )).map((pairAddress) => {
      const event = eventAndAddress.find(({ address }) => pairAddress === address);
      if (!event) {
        throw new Error('no swap event emitted!');
      }
      return {
        contract: new Contract(pairAddress, PairJSON.abi, Configuration.provider),
        event: event.event,
      };
    });

    switch (name) {
      case 'swapExactTokensForTokens': {
        const { contract: lastSwapPair, event } = pairPath[pairPath.length - 1];
        const token0Address = (await lastSwapPair.token0()).toLowerCase();
        const { args: [amountIn] } = transactionDescription;

        const { timestamp } = await Configuration.provider.getBlock(blockNumber as number);
        if (fromToken.address === this.token.address) {
          return this.swapExactTokensForTokensOut(token0Address, toToken, event, timestamp, amountIn);
        } else {
          return this.swapExactTokensForTokensIn(token0Address, toToken, event, fromToken, timestamp, amountIn);
        }
      }
      case 'swapTokensForExactTokens': {
        const { contract: firstSwapPair, event } = pairPath[0];
        const token0Address = (await firstSwapPair.token0()).toLowerCase();
        const { timestamp } = await Configuration.provider.getBlock(blockNumber as number);
        const { args: [amountOut] } = transactionDescription;
        if (fromToken.address === this.token.address) {
          const amountIn = fromToken.address === token0Address ? event.args.amount0In : event.args.amount1In;
          const price = await this.getPrice(fromToken, timestamp);
          if (price.eq('0')) {
            Configuration.logger.debug('No price exists');
            return { hold: new BigNumberJs(0), cost: new BigNumberJs(0) };
          }
          const decimalsBN = new BigNumberJs('10').pow((await toToken.decimals()).toString());
          return {
            hold: new BigNumberJs(amountIn.toString()).multipliedBy(-1),
            cost: new BigNumberJs(amountOut.toString()).multipliedBy(price).div(decimalsBN).multipliedBy(-1),
          };
        } else {
          const amountIn = fromToken.address === token0Address ? event.args.amount0In : event.args.amount1In;
          const price = await this.getPrice(fromToken, timestamp);
          if (price.eq('0')) {
            Configuration.logger.debug('No price exists');
            return { hold: new BigNumberJs(0), cost: new BigNumberJs(0) };
          }
          const decimalsBN = new BigNumberJs('10').pow((await fromToken.decimals()).toString());
          return {
            hold: new BigNumberJs(amountOut.toString()),
            cost: new BigNumberJs(amountIn.toString()).multipliedBy(price).div(decimalsBN),
          };
        }
      }
      case 'swapExactETHForTokens': {
        return {
          hold: new BigNumberJs(0),
          cost: new BigNumberJs(0),
        };
      }
      case 'swapTokensForExactETH': {
        return {
          hold: new BigNumberJs(0),
          cost: new BigNumberJs(0),
        };
      }
      case 'swapExactTokensForETH': {
        return {
          hold: new BigNumberJs(0),
          cost: new BigNumberJs(0),
        };
      }
      case 'swapETHForExactTokens': {
        return {
          hold: new BigNumberJs(0),
          cost: new BigNumberJs(0),
        };
      }
      default:
        Configuration.logger.debug('Unknown method: ' + name);
        return {
          hold: new BigNumberJs(0),
          cost: new BigNumberJs(0),
        };
    }
  }

  private async swapExactTokensForTokensIn (
    token0Address: any,
    toToken: Contract,
    event: LogDescription,
    fromToken: Contract,
    timestamp: number,
    amountIn: BigNumber,
  ) {
    const amountOut = token0Address === toToken.address ? event.args.amount0Out : event.args.amount1Out;
    const price = await this.getPrice(fromToken, timestamp);
    if (price.eq('0')) {
      Configuration.logger.debug('No price exists');
      return { hold: new BigNumberJs(0), cost: new BigNumberJs(0) };
    }
    const decimalsBN = new BigNumberJs('10').pow((await toToken.decimals()).toString());
    return {
      hold: new BigNumberJs(amountOut.toString()),
      cost: new BigNumberJs(amountIn.toString()).multipliedBy(price).div(decimalsBN),
    };
  }

  private async swapExactTokensForTokensOut (
    token0Address: any,
    toToken: Contract,
    event: LogDescription,
    timestamp: number,
    amountIn: BigNumber,
  ) {
    const amountOut = token0Address === toToken.address ? event.args.amount0Out : event.args.amount1Out;
    const price = await this.getPrice(toToken, timestamp);
    if (price.eq('0')) {
      Configuration.logger.debug('No price exists');
      return { hold: new BigNumberJs(0), cost: new BigNumberJs(0) };
    }
    const decimalsBN = new BigNumberJs('10').pow((await toToken.decimals()).toString());
    return {
      hold: new BigNumberJs(amountIn.toString()).multipliedBy(-1),
      cost: new BigNumberJs(amountOut.toString()).multipliedBy(price).div(decimalsBN).multipliedBy(-1),
    };
  }
}
