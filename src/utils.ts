import {CollectResult} from './transfer-collect'
import {Configuration} from './config'
import {Contract} from 'ethers'
import {abi} from './erc20.json'
import axios from 'axios'
import BigNumber from 'bignumber.js'

export const extractTransferAddress = (result: CollectResult) => {
  let addresses = result.events.flatMap(event => {
    if (event.args !== undefined) {
      return [event.args[0], event.args[1]]
    }
    return []
  }) as Array<string>
  addresses = Array.from(new Set(addresses)).filter(address => address !== '0x0000000000000000000000000000000000000000')
  return {
    from: result.from,
    to: result.to,
    addresses,
  }
}

export const getBalances = async (token: string, addresses: string[]) => {
  // 拆成100个地址每组
  const steps = 100
  let result: Array<{address: string; balance: string}> = []
  const startAt = new Date().getTime()
  for (let i = 0; i < addresses.length; i += steps) {
    const slice = addresses.slice(i, i + steps)
    result = [
      ...result,
      ...(await Promise.all(slice.map(address => balanceOf(token, address)))).map((balance, index) => {
        return {address: slice[index], balance: balance.toString()}
      }),
    ]
  }
  Configuration.logger.debug('Fetch %d balances with %d ms', addresses.length, new Date().getTime() - startAt)

  return result
}

export const retry = <T>(
  promiseFu: () => Promise<T>,
  times = Configuration.retry,
  errCallback = (error: Error) => {
    Configuration.logger.error('Retry error: ' + error.message)
    return
  },
): Promise<T> => {
  return new Promise(async (resolve, reject) => {
    while (times--) {
      try {
        let ret = await promiseFu()
        resolve(ret)
        break
      } catch (error) {
        errCallback(error)
        if (!times) reject(error)
      }
    }
  })
}

export const splitTasks = (start: number, end: number, length: number, count: number) => {
  const result: Array<Array<{from: number; to: number}>> = []
  for (let i = start; i <= end; i += length * count) {
    let tasks = []
    for (let j = i; j < i + length * count && j <= end; j += length) {
      tasks.push({from: j, to: j + length - 1 >= end ? end : j + length - 1})
    }
    result.push(tasks)
  }
  return result
}

export function strip0x(address: string) {
  return address.slice(0, 2) === '0x' ? address.slice(2) : address
}

export function add0x(address: string) {
  return address.slice(0, 2) === '0x' ? address : `0x${address}`
}

export function balanceOf(token: string, address: string): Promise<BigNumber> {
  const erc20 = new Contract(token, abi, Configuration.provider)
  return retry<BigNumber>(
    () => erc20.balanceOf(address),
    Configuration.retry,
    err => {
      Configuration.logger.error('Query balance failed! token: %s, address: %s, error: %s', token, address, err.message)
    },
  )
}

export async function getPrice(token: string, timestamp: number) {
  const response = await axios.post(
    'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2',
    {
      query: '{tokenDayDatas(where:{date:' + timestamp + ',token:"' + token + '"}){priceUSD}}',
      variables: {},
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )
  const tokenDayDatas = (response as any).data.data.tokenDayDatas as Array<{priceUSD: number}>
  if (tokenDayDatas.length > 0) {
    return new BigNumber(tokenDayDatas[0].priceUSD)
  }
  return new BigNumber(0)
}
