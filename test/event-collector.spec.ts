import {assert} from 'chai'
import {GanacheFixture} from './helpers/ganache'
import {Configuration} from '../src/config'
import {BigNumber, Contract, ContractFactory, utils} from 'ethers'
import {abi, byteCode} from '../src/erc20.json'
import {generateAccounts, splitToRandomNum} from './helpers/utils'
import {CollectResult, Collector} from '../src/collector'

describe('Event Collector Test', () => {
  beforeEach(async () => {
    await GanacheFixture.start()
  })

  async function extracted(token: Contract, value: number, counts: number) {
    await token.mint(Configuration.wallet.getAddress(), BigNumber.from(value))
    const accounts = generateAccounts(counts)
    const transfers = splitToRandomNum(value, counts)
    for (let i = 0; i < counts; i++) {
      await token.transfer(utils.computeAddress(accounts[i].publicKey), BigNumber.from(transfers[i]))
    }
  }

  it('get events', async () => {
    const wallet = Configuration.wallet
    let contractFactory = new ContractFactory(abi, byteCode, wallet)
    const token = await contractFactory.deploy('Token', 'Token')

    const eventCollector = new Collector(token, 0, 100)

    const value = 10000
    const accounts = 67
    await extracted(token, value, accounts)

    const result = await eventCollector.getEvents()
    await assert.equal(result.events.length, accounts + 1)
  })

  afterEach(async () => {
    await GanacheFixture.stop()
  })
})
