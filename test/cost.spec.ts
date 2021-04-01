import { GanacheFixture } from './helpers/ganache';
import { Configuration } from '../src/config';
import { BigNumber, Contract, utils } from 'ethers';
import { deployERC20Token, deployWETH, getPrice, mintToken, getPriceFrom } from './helpers/utils';
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
    const { hash } = await uniswap.swapExactTokensForTokens([tokenA, tokenB], amountIn, Configuration.wallet.address);
    const { hold, cost } = await new Cost(Configuration.wallet.address, tokenB.address, getPrice).start();
    const price = await getPriceFrom(hash, tokenA);
    const [{ args: { amount0Out } }] = (await uniswap.getSwapEvent(tokenA, tokenB, Configuration.wallet.address)) as Result | { args: { amount0Out: BigNumber } }[];
    const expectedHold = amount0Out.toString();
    assert.equal(hold.toString(), expectedHold);
    const expectedCost = price.multipliedBy(amountIn.toString()).div(new BigNumberJs(10).pow(18));
    assert.equal(cost.toString(), expectedCost.toString());
  });

  it('swapExactTokensForTokens - swap out', async () => {
    const [tokenA, tokenB] = tokens;
    const amountIn = utils.parseEther('10');
    const { hash } = await uniswap.swapExactTokensForTokens([tokenA, tokenB], amountIn, Configuration.wallet.address);
    const { hold, cost } = await new Cost(Configuration.wallet.address, tokenA.address, getPrice).start();
    const price = await getPriceFrom(hash, tokenB);
    const [{ args: { amount0Out } }] = (await uniswap.getSwapEvent(tokenA, tokenB, Configuration.wallet.address)) as Result | { args: { amount0Out: BigNumber } }[];
    const expectedHold = '-' + amountIn.toString();
    assert.equal(hold.toString(), expectedHold);
    const expectedCost = '-' + price.multipliedBy(amount0Out.toString()).div(new BigNumberJs(10).pow(18)).toString();
    assert.equal(cost.toString(), expectedCost);
  });

  it('swapTokensForExactTokens - swap in', async () => {
    const [tokenA, tokenB] = tokens;
    const amountMaxIn = utils.parseEther('20');
    const amountOut = utils.parseEther('10');
    const { hash } = await uniswap.swapTokensForExactTokens([tokenA, tokenB], amountMaxIn, amountOut, Configuration.wallet.address);
    const { hold, cost } = await new Cost(Configuration.wallet.address, tokenB.address, getPrice).start();

    const expectedHold = amountOut.toString();
    assert.equal(hold.toString(), expectedHold);

    const price = await getPriceFrom(hash, tokenA);
    const [{ args: { amount1In } }] = (await uniswap.getSwapEvent(tokenA, tokenB, Configuration.wallet.address)) as Result | { args: { amount0Out: BigNumber } }[];
    const expectedCost = price.multipliedBy(amount1In.toString()).div(new BigNumberJs(10).pow(18)).toString();
    assert.equal(cost.toString(), expectedCost);
  });

  it('swapTokensForExactTokens - swap out', async () => {
    const [tokenA, tokenB] = tokens;
    const amountMaxIn = utils.parseEther('20');
    const amountOut = utils.parseEther('10');
    const { hash } = await uniswap.swapTokensForExactTokens([tokenA, tokenB], amountMaxIn, amountOut, Configuration.wallet.address);
    const { hold, cost } = await new Cost(Configuration.wallet.address, tokenA.address, getPrice).start();

    const [{ args: { amount1In } }] = (await uniswap.getSwapEvent(tokenA, tokenB, Configuration.wallet.address)) as Result | { args: { amount0Out: BigNumber } }[];
    const expectedHold = '-' + amount1In.toString();
    assert.equal(hold.toString(), expectedHold);

    const price = await getPriceFrom(hash, tokenA);
    const expectedCost = '-' + price.multipliedBy(amountOut.toString()).div(new BigNumberJs(10).pow(18)).toString();
    assert.equal(cost.toString(), expectedCost);
  });
  afterEach(async () => {
    await GanacheFixture.stop();
    tokens = [];
  });
});
