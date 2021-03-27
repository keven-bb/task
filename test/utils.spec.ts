import {assert} from 'chai'
import {GanacheFixture} from './helpers/ganache'
import {Configuration} from '../src/config'
import {BigNumber, Contract, ContractFactory, utils} from 'ethers'
import {abi, byteCode} from '../src/erc20.json'
import {generateAccounts, splitToRandomNum} from './helpers/utils'
import {Collector} from '../src/collector'
import {extractTransferAddress} from '../src/utils'

describe('Util Test', () => {
  beforeEach(async () => {
    await GanacheFixture.start()
  })

  it('extract address', async () => {
    const wallet = Configuration.wallet
    let contractFactory = new ContractFactory(abi, byteCode, wallet)
    const token = await contractFactory.deploy('Token', 'Token')

    const eventCollector = new Collector(token, 0, 1000)

    const total = 10000
    const count = 15
    await token.mint(Configuration.wallet.getAddress(), BigNumber.from(total))
    const accounts = generateAccounts(count)
    const transfers = splitToRandomNum(total / 2, count)
    for (let i = 0; i < count; i++) {
      await token.transfer(utils.computeAddress(accounts[i].publicKey), BigNumber.from(transfers[i]))
      await token.transfer(utils.computeAddress(accounts[i].publicKey), BigNumber.from(transfers[i]))
    }
    let result = await eventCollector.getEvents()
    assert.equal(count * 2 + 1, result.events.length)

    const re = extractTransferAddress(result)
    assert.equal(accounts.length + 1, re.addresses.length)
  })

  afterEach(async () => {
    await GanacheFixture.stop()
  })
})
