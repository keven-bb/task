import {Contract, EventFilter} from 'ethers'
import {Configuration} from './config'
import {Event} from '@ethersproject/contracts'
import {retry, splitTasks} from './utils'

const logger = Configuration.logger

export class CollectResult {
  constructor(public readonly from: number, public readonly to: number, public readonly events: Array<Event>) {}
}

export class TransferCollector {
  private readonly contract: Contract
  private readonly from: number
  private readonly to: number

  constructor(contract: Contract, from: number, to: number) {
    this.contract = contract
    this.from = from
    this.to = to
  }

  public async getEvents() {
    const latest = await Configuration.provider.getBlockNumber()
    const tasks = splitTasks(
      this.from,
      this.to > latest ? latest : this.to,
      Configuration.collectBlocks,
      Configuration.collectRequests,
    )
    let events: Array<Event> = []

    for (let task of tasks) {
      const promiseTasks = await Promise.allSettled(
        task.map(({from, to}) => this.queryFilter(this.contract.filters.Transfer(), from, to)),
      )
      promiseTasks.forEach(t => {
        if (t.status === 'fulfilled') {
          events = [...events, ...t.value]
          return
        }
        throw t.reason
      })
    }

    logger.debug('Contract: %s, Total: %d, From: %d, to: %d', this.contract.address, events.length, this.from, this.to)

    return new CollectResult(this.from, this.to, events)
  }

  private async queryFilter(filter: EventFilter, from: number, to: number) {
    try {
      const logs = await retry(async () => {
        try {
          return await this.contract.queryFilter(filter, from, to)
        } catch (e) {
          logger.error('Query %s(%d - %d) failed, error: %s', this.contract.address, from, to, e.message)
          throw e
        }
      }, 3)
      logger.debug(
        'Scan blocks from %d to %d, get %d events in contract %s.',
        from,
        to,
        logs.length,
        this.contract.address,
      )
      return logs
    } catch (e) {
      logger.error('Query %s(%d - %d) still failed, stop!', this.contract.address, this.from, this.to)
      throw e
    }
  }
}
