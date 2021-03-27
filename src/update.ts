import {Holder} from './holder'
import {Configuration} from './config'
import {Tokens} from './db/tokens'
import {Balances} from './db/balances'
import {balanceOf, getBalances} from './utils'

const [, , address, fromStr] = process.argv
if (address === '' || fromStr === '') {
  console.log('command error: yarn update ${tokenAddress} ${fromBlock}')
  process.exit(-1)
}

;(async () => {
  const startAt = new Date().getTime()
  try {
    const from = parseInt(fromStr)

    let token = await Tokens.addToken(address, from)
    const latest = await Configuration.provider.getBlockNumber()
    const holder = new Holder(token, token.current, latest)
    await holder.addAddress()
    token = await Tokens.getTokenById(token.id)
    const total = await Balances.countByTokenId(token.id)
    const limit = 2000
    for (let i = 0; i < total; i += limit) {
      const addresses = await Balances.queryAddress(token.id, limit, i)
      const balances = await getBalances(token.address, addresses)
      await Balances.updateBalances(balances.map(balance => ({...balance, tid: token.id})))
    }
  } finally {
    Configuration.logger.debug(`Finish：${new Date().getTime() - startAt} ms`)
  }
})()
