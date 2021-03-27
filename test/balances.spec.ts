import {assert} from 'chai'
import {GanacheFixture} from './helpers/ganache'
import {Balances} from '../src/db/balances'
// @ts-ignore
import DBMigrate from 'db-migrate'

describe('Balances Test', () => {
  beforeEach(async () => {
    await GanacheFixture.start()
    const dbmigrate = DBMigrate.getInstance(true)
    await dbmigrate.reset().then(() => dbmigrate.up())
  })

  async function checkBalances(balances: {address: string; balance: string; tid: string}[]) {
    await Promise.all(
      balances.map(async balance => {
        const res = await Balances.queryBalance(balance.tid, balance.address)
        assert.equal(res, balance.balance)
      }),
    )
  }

  it('add balances', async () => {
    const balances = [
      {tid: '1', address: 'abc', balance: '12'},
      {tid: '1', address: 'cde', balance: '13'},
    ]
    await Balances.addBalance(balances)
    let result = await Balances.countByTokenId('1')
    assert.equal(balances.length, result)
    await checkBalances(balances)

    balances.push({tid: '1', address: 'abcd', balance: '14'})
    await Balances.addBalance(balances)
    result = await Balances.count()
    assert.equal(balances.length, result)
    await checkBalances(balances)

    await Balances.addBalance(balances)
    result = await Balances.count()
    assert.equal(balances.length, result)
    await checkBalances(balances)

    balances[0].balance = '235'
    await Balances.updateBalances(balances)
    await checkBalances(balances)
  })

  afterEach(async () => {
    await GanacheFixture.stop()
  })
})
