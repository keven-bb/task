import { CollectResult } from './transfer-collect';
import { Configuration } from './config';
import { Contract, utils } from 'ethers';
import { abi } from './erc20.json';
import axios from 'axios';
import BigNumber from 'bignumber.js';
import { BigNumberish } from '@ethersproject/bignumber';
import PairJSON from '@uniswap/v2-periphery/build/IUniswapV2Pair.json';

export const extractTransferAddress = (result: CollectResult) => {
  let addresses = result.events.flatMap(event => {
    if (event.args !== undefined) {
      return [event.args[0], event.args[1]];
    }
    return [];
  }) as Array<string>;
  addresses = Array.from(new Set(addresses)).filter(address => address !== '0x0000000000000000000000000000000000000000');
  return {
    from: result.from,
    to: result.to,
    addresses,
  };
};

export const getBalances = async (token: string, addresses: string[]) => {
  const steps = 100;
  let result: Array<{address: string; balance: string}> = [];
  const startAt = new Date().getTime();
  for (let i = 0; i < addresses.length; i += steps) {
    const slice = addresses.slice(i, i + steps);
    result = [
      ...result,
      ...(await Promise.all(slice.map(address => balanceOf(token, address)))).map((balance, index) => {
        return { address: slice[index], balance: balance.toString() };
      }),
    ];
  }
  Configuration.logger.debug('Fetch %d balances with %d ms', addresses.length, new Date().getTime() - startAt);

  return result;
};

export const retry = async <T>(
  promiseFu: () => Promise<T>,
  times = Configuration.retry,
  errCallback = (error: Error) => {
    Configuration.logger.error('Retry error: ' + error.message);
  },
): Promise<T> => {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve, reject) => {
    while (times--) {
      try {
        const ret = await promiseFu();
        resolve(ret);
        break;
      } catch (error) {
        errCallback(error);
        if (!times) reject(error);
      }
    }
  });
};

export const splitTasks = (start: number, end: number, length: number, count: number) => {
  const result: Array<Array<{from: number; to: number}>> = [];
  for (let i = start; i <= end; i += length * count) {
    const tasks = [];
    for (let j = i; j < i + length * count && j <= end; j += length) {
      tasks.push({ from: j, to: j + length - 1 >= end ? end : j + length - 1 });
    }
    result.push(tasks);
  }
  return result;
};

export const strip0x = (address: string) => (address.slice(0, 2) === '0x' ? address.slice(2) : address);

export const add0x = (address: string) => (address.slice(0, 2) === '0x' ? address : `0x${address}`);

export const balanceOf = (token: string, address: string): Promise<BigNumber> => {
  const erc20 = new Contract(token, abi, Configuration.provider);
  return retry<BigNumber>(
    () => erc20.balanceOf(address),
    Configuration.retry,
    err => {
      Configuration.logger.error('Query balance failed! token: %s, address: %s, error: %s', token, address, err.message);
    },
  );
};

export const getPrice = async (token: Contract, timestamp: number) => {
  const response = await axios.post(
    'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2',
    {
      query: '{tokenDayDatas(where:{date:' + timestamp + ',token:"' + token.address + '"}){priceUSD}}',
      variables: {},
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  );
  const tokenDayDatas = (response as any).data.data.tokenDayDatas as Array<{priceUSD: number}>;
  if (tokenDayDatas.length > 0) {
    return new BigNumber(tokenDayDatas[0].priceUSD);
  }
  return new BigNumber(0);
};

export const getPriceFromCMC = async (token:string, timestamp: number) => {

};

export const parseRouterTransaction = (tx: {data: string; value?: BigNumberish}) =>
  new utils.Interface(PairJSON.abi).parseTransaction(tx);

export const timestampToDateTimestamp = (timestamp:number) => {
  const date = new Date(timestamp * 1000);
  return Date.UTC(date.getFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000;
};

export const formatDate = (timestamp:number) => {
  const date = new Date(timestamp * 1000);
  return `${date.getUTCDate()}-${date.getUTCMonth() + 1}-${date.getUTCFullYear()}`;
};
