import { GanacheFixture } from './helpers/ganache';
import { Configuration } from '../src/config';
import { BigNumber, Contract, utils } from 'ethers';
import { deployERC20Token, deployWETH, getPrice, getPriceFrom, mintToken } from './helpers/utils';
import { Uniswap } from './helpers/uniswap';
import { Cost } from '../src/cost-class';
import { assert } from 'chai';
import BigNumberJs from 'bignumber.js';
import { Result } from 'ethers/lib/utils';

describe('Uniswap Cost Test', () => {
  let WETH: Contract;
  let tokens: Contract[] = [];
  let uniswap: Uniswap;

  beforeEach(async () => {
    await GanacheFixture.start();
    WETH = await deployWETH(utils.parseEther('1000000'));
    for (let i = 0; i < 2; i++) {
      const token = await deployERC20Token('Token' + i, 'Token' + i);
      await mintToken(token, Configuration.wallet.address, utils.parseEther('1000000'));
      tokens = [...tokens, token];
    }
    uniswap = await Uniswap.deploy(WETH);
    for (let i = 0; i < tokens.length; i++) {
      await uniswap.addLiquidity(
        tokens[i],
        WETH,
        BigNumber.from(utils.parseEther('1000')),
        BigNumber.from(utils.parseEther('1000')),
      );
      for (let j = 0; j < tokens.length; j++) {
        if (i !== j) {
          await uniswap.addLiquidity(
            tokens[i],
            tokens[j],
            BigNumber.from(utils.parseEther('1000')),
            BigNumber.from(utils.parseEther('1000')),
          );
        }
      }
    }
  });

  it('swapExactTokensForTokens - swap in', async () => {
    const [tokenA, tokenB] = tokens;
    const amountIn = utils.parseEther('10');
    // 使用 确定量的A 换 B
    const { hash } = await uniswap.swapExactTokensForTokens([tokenA, tokenB], amountIn, Configuration.wallet.address);
    // 求持有B的成本
    const { hold, cost } = await new Cost(Configuration.wallet.address, tokenB.address, getPrice).start();
    // 持有量：B 的数量
    const [{ args: { amount0Out } }] = (await uniswap.getSwapEvent(tokenA, tokenB, Configuration.wallet.address)) as Result | { args: { amount0Out: BigNumber } }[];
    const expectedHold = amount0Out.toString();
    assert.equal(hold.toString(), expectedHold);
    // 成本：A 的数量 * 价格
    const price = await getPriceFrom(hash, tokenA);
    const expectedCost = price.multipliedBy(amountIn.toString()).div(new BigNumberJs(10).pow(18));
    assert.equal(cost.toString(), expectedCost.toString());
  });

  it('swapExactTokensForTokens - swap out', async () => {
    const [tokenA, tokenB] = tokens;
    const amountIn = utils.parseEther('10');
    // 使用 确定量的A 换 B
    const { hash } = await uniswap.swapExactTokensForTokens([tokenA, tokenB], amountIn, Configuration.wallet.address);
    // 求持有A的成本
    const { hold, cost } = await new Cost(Configuration.wallet.address, tokenA.address, getPrice).start();
    // 持有量：A 的数量
    const expectedHold = '-' + amountIn.toString();
    assert.equal(hold.toString(), expectedHold);
    // 成本：B 的数量 * 价格
    const price = await getPriceFrom(hash, tokenB);
    const [{ args: { amount0Out } }] = (await uniswap.getSwapEvent(tokenA, tokenB, Configuration.wallet.address)) as Result | { args: { amount0Out: BigNumber } }[];
    const expectedCost = '-' + price.multipliedBy(amount0Out.toString()).div(new BigNumberJs(10).pow(18)).toString();
    assert.equal(cost.toString(), expectedCost);
  });

  it('swapTokensForExactTokens - swap in', async () => {
    const [tokenA, tokenB] = tokens;
    const amountMaxIn = utils.parseEther('20');
    const amountOut = utils.parseEther('10');
    // 使用 A 换 确定量的B
    const { hash } = await uniswap.swapTokensForExactTokens([tokenA, tokenB], amountMaxIn, amountOut, Configuration.wallet.address);
    // 求持有B的成本
    const { hold, cost } = await new Cost(Configuration.wallet.address, tokenB.address, getPrice).start();
    // 持有量：B 的数量
    const expectedHold = amountOut.toString();
    assert.equal(hold.toString(), expectedHold);
    // 成本：A 的数量 * 价格
    const price = await getPriceFrom(hash, tokenA);
    const [{ args: { amount1In } }] = (await uniswap.getSwapEvent(tokenA, tokenB, Configuration.wallet.address)) as Result | { args: { amount0Out: BigNumber } }[];
    const expectedCost = price.multipliedBy(amount1In.toString()).div(new BigNumberJs(10).pow(18)).toString();
    assert.equal(cost.toString(), expectedCost);
  });

  it('swapTokensForExactTokens - swap out', async () => {
    const [tokenA, tokenB] = tokens;
    const amountMaxIn = utils.parseEther('20');
    const amountOut = utils.parseEther('10');
    // 使用 A 换 确定量的B
    const { hash } = await uniswap.swapTokensForExactTokens([tokenA, tokenB], amountMaxIn, amountOut, Configuration.wallet.address);
    // 求持有A的成本
    const { hold, cost } = await new Cost(Configuration.wallet.address, tokenA.address, getPrice).start();
    // 持有量：A 的数量
    const [{ args: { amount1In } }] = (await uniswap.getSwapEvent(tokenA, tokenB, Configuration.wallet.address)) as Result | { args: { amount0Out: BigNumber } }[];
    const expectedHold = '-' + amount1In.toString();
    assert.equal(hold.toString(), expectedHold);
    // 成本：B 的数量 * 价格
    const price = await getPriceFrom(hash, tokenB);
    const expectedCost = '-' + price.multipliedBy(amountOut.toString()).div(new BigNumberJs(10).pow(18)).toString();
    assert.equal(cost.toString(), expectedCost);
  });

  it('swapExactTokensForTokens and swapTokensForExactTokens - swap in', async () => {
    const [tokenA, tokenB] = tokens;

    let expectedTotalHold = new BigNumberJs(0);
    let expectedTotalCost = new BigNumberJs(0);

    // 交易1：使用 确定量的 A 换 B
    const amountIn = utils.parseEther('10');
    const { hash: hash1 } = await uniswap.swapExactTokensForTokens([tokenA, tokenB], amountIn, Configuration.wallet.address);

    // 交易2：使用 A 换 确定量的B
    const amountOut = utils.parseEther('10');
    const { hash: hash2 } = await uniswap.swapTokensForExactTokens([tokenA, tokenB], utils.parseEther('20'), amountOut, Configuration.wallet.address);

    const { hold, cost } = await new Cost(Configuration.wallet.address, tokenB.address, getPrice).start();

    // 交易1：交易的成本
    const price1 = await getPriceFrom(hash1, tokenA);
    expectedTotalCost = expectedTotalCost.plus(price1.multipliedBy(amountIn.toString()).div(new BigNumberJs(10).pow(18)));
    const [{ args: { amount0Out } }, { args: { amount1In } }] = (await uniswap.getSwapEvent(tokenA, tokenB, Configuration.wallet.address)) as Result | { args: {amount1In:BigNumber, amount0Out: BigNumber } }[];
    // 交易1：获得的 token 数量
    expectedTotalHold = expectedTotalHold.plus(amount0Out.toString());
    // 交易2：成本
    const price2 = await getPriceFrom(hash2, tokenA);
    expectedTotalCost = expectedTotalCost.plus(price2.multipliedBy(amount1In.toString()).div(new BigNumberJs(10).pow(18)));
    // 交易2：获得的 token 数量
    expectedTotalHold = expectedTotalHold.plus(amountOut.toString());

    assert.equal(hold.toString(), expectedTotalHold.toString());
    assert.equal(cost.toString(), expectedTotalCost.toString());
  });

  afterEach(async () => {
    await GanacheFixture.stop();
    tokens = [];
  });
});
