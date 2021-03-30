import {BigNumber, Contract, ContractFactory, ethers, utils} from 'ethers'
import {Configuration} from '../../src/config'
import WETHJson from '@uniswap/v2-periphery/build/WETH9.json'
import {abi, byteCode} from '../../src/erc20.json'

export const generateAccounts = (count: number) => {
  return Array.from({length: count}, _ => {
    const privateKey = '0x' + Buffer.from(utils.randomBytes(32)).toString('hex')
    return new utils.SigningKey(privateKey)
  })
}

export const splitToRandomNum = (total: number, n: number) => {
  const res = []
  let range = total
  let current = 0
  for (let i = 0; i < n - 1; i++) {
    const item = Math.ceil(Math.random() * (range / 2))
    res.push(item)
    range -= item
    current += item
  }
  res.push(total - current)
  return res
}

export const deployWETH = async (depositAmount: BigNumber) => {
  const wallet = Configuration.wallet
  const WETHFactory = new ethers.ContractFactory(WETHJson.abi, WETHJson.bytecode, wallet)
  const WETH = await WETHFactory.deploy()
  await WETH.deposit({value: depositAmount})
  return WETH
}

export function deployERC20Token(name: string, symbol: string) {
  return new ContractFactory(abi, byteCode, Configuration.wallet).deploy(name, symbol)
}

export function mintToken(token: Contract, address: string, amount: BigNumber) {
  return token.mint(address, amount)
}
