import {assert} from 'chai'
import {GanacheFixture} from './helpers/ganache'
import {Configuration} from '../src/config'
import {BigNumber, Contract, ContractFactory, utils} from 'ethers'
import {abi, byteCode} from '../src/erc20.json'
import {deployERC20Token, deployWETH, generateAccounts, mintToken, splitToRandomNum} from './helpers/utils'
import {CollectResult, SwapCollect, TransferCollect} from '../src/transfer-collect'
import {Uniswap} from './helpers/uniswap'
import {retry} from '../src/utils'

describe('Uniswap Test', () => {
  beforeEach(async () => {
    await GanacheFixture.start()
  })

  it('collect swap events', async () => {
    const WETH = await deployWETH(utils.parseEther('1000000'))
    const token = await deployERC20Token('TokenA', 'TokenA')
    await mintToken(token, Configuration.wallet.address, utils.parseEther('1000000'))
    const uniswap = await Uniswap.deploy(WETH)
    const pair = await uniswap.addLiquidity(
      WETH,
      token,
      BigNumber.from(utils.parseEther('10')),
      BigNumber.from(utils.parseEther('10')),
    )
    await uniswap.swapExactTokensForTokens([WETH, token], utils.parseEther('1'), Configuration.wallet.address)
    await uniswap.swapExactTokensForTokens([WETH, token], utils.parseEther('1'), Configuration.wallet.address)
    await uniswap.swapExactTokensForTokens([WETH, token], utils.parseEther('1'), Configuration.wallet.address)

    const eventCollector = new SwapCollect(pair, 0, 100)

    const result = await eventCollector.getEvents([null, null, null, null, null, Configuration.wallet.address])
    await assert.equal(result.events.length, 3)
  })

  afterEach(async () => {
    await GanacheFixture.stop()
  })
})
