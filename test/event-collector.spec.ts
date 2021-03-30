import {assert} from 'chai'
import {GanacheFixture} from './helpers/ganache'
import {Configuration} from '../src/config'
import {BigNumber, Contract, utils} from 'ethers'
import {deployERC20Token, generateAccounts, splitToRandomNum} from './helpers/utils'
import {TransferCollect} from '../src/transfer-collect'

describe('Event Collector Test', () => {
  beforeEach(async () => {
    await GanacheFixture.start()
  })

  async function mintToken(token: Contract, value: number, counts: number) {
    await token.mint(Configuration.wallet.getAddress(), BigNumber.from(value))
    const accounts = generateAccounts(counts)
    const transfers = splitToRandomNum(value, counts)
    for (let i = 0; i < counts; i++) {
      await token.transfer(utils.computeAddress(accounts[i].publicKey), BigNumber.from(transfers[i]))
    }
  }

  it('get events', async () => {
    const token = await deployERC20Token('Token', 'Token')

    const eventCollector = new TransferCollect(token, 0, 100)

    const value = 10000
    const accounts = 67
    await mintToken(token, value, accounts)

    const result = await eventCollector.getEvents()
    await assert.equal(result.events.length, accounts + 1)
  })

  afterEach(async () => {
    await GanacheFixture.stop()
  })
})
