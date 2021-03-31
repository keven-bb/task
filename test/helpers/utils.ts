import { BigNumber, Contract, ContractFactory, ethers, utils } from 'ethers';
import { Configuration } from '../../src/config';
import WETHJson from '@uniswap/v2-periphery/build/WETH9.json';
import { abi, byteCode } from '../../src/erc20.json';
import BigNumberJs from 'bignumber.js';

export const generateAccount = () => new utils.SigningKey('0x' + Buffer.from(utils.randomBytes(32)).toString('hex'));

export const generateAccounts = (count: number) => {
  return Array.from({ length: count }, generateAccount);
};

export const splitToRandomNum = (total: number, n: number) => {
  const res = [];
  let range = total;
  let current = 0;
  for (let i = 0; i < n - 1; i++) {
    const item = Math.ceil(Math.random() * (range / 2));
    res.push(item);
    range -= item;
    current += item;
  }
  res.push(total - current);
  return res;
};

export const deployWETH = async (depositAmount: BigNumber) => {
  const wallet = Configuration.wallet;
  const WETHFactory = new ethers.ContractFactory(WETHJson.abi, WETHJson.bytecode, wallet);
  const WETH = await WETHFactory.deploy();
  await WETH.deposit({ value: depositAmount });
  return WETH;
};

export const deployERC20Token = (name: string, symbol: string) => new ContractFactory(abi, byteCode, Configuration.wallet).deploy(name, symbol);

export const mintToken = (token: Contract, address: string, amount: BigNumber) => token.mint(address, amount);

const prices:{[key:string]:{[key:number]:BigNumberJs}} = {};
export const getPrice = async (token:Contract, timestamp:number) => {
  const price = new BigNumberJs(Math.random());
  if (!prices[token.address]) {
    prices[token.address] = {};
  }
  prices[token.address][timestamp] = price;
  return price;
};

export async function getPriceFrom (hash: string, token: Contract) {
  const { blockNumber } = await Configuration.provider.getTransactionReceipt(hash);
  const { timestamp } = await Configuration.provider.getBlock(blockNumber);
  const address = token.address.toLowerCase();
  return prices[address] && prices[address][timestamp];
}
