import { Contract, EventFilter } from 'ethers';
import { Configuration } from './config';
import { Event } from '@ethersproject/contracts';
import { retry, splitTasks } from './utils';

const logger = Configuration.logger;

export type CollectResult = {
  readonly from: number
  readonly to: number
  readonly events: Event[]
}

export abstract class AbstractCollect {
  protected readonly contract: Contract
  private readonly from: number
  private readonly to: number

  constructor (contract: Contract, from: number, to: number) {
    this.contract = contract;
    this.from = from;
    this.to = to;
  }

  public async getEvents (
    parameter: Array<Array<string | null> | string | null> = [],
    blocks: number = Configuration.collectBlocks,
    requests: number = Configuration.collectRequests,
  ): Promise<CollectResult> {
    const latest = await Configuration.provider.getBlockNumber();
    const tasks = splitTasks(
      this.from,
      this.to > latest ? latest : this.to,
      blocks,
      requests,
    );
    let events: Array<Event> = [];

    for (const task of tasks) {
      const promiseTasks = await Promise.allSettled(
        task.map(({ from, to }) => this.queryFilter(this.getFilter(parameter), from, to)),
      );
      promiseTasks.forEach(t => {
        if (t.status === 'fulfilled') {
          events = [...events, ...t.value];
          return;
        }
        throw t.reason;
      });
    }

    logger.debug('Contract: %s, Total: %d, From: %d, to: %d', this.contract.address, events.length, this.from, this.to);

    return {
      from: this.from,
      to: this.to,
      events,
    };
  }

  protected abstract getFilter(parameter: Array<Array<string | null> | string | null>): EventFilter

  private async queryFilter (filter: EventFilter, from: number, to: number) {
    try {
      const logs = await retry(
        async () => {
          return await this.contract.queryFilter(filter, from, to);
        },
        Configuration.retry,
        err => {
          logger.error('Query %s(%d - %d) failed, error: %s', this.contract.address, from, to, err.message);
        },
      );
      logger.debug(
        'Scan blocks from %d to %d, get %d events in contract %s.',
        from,
        to,
        logs.length,
        this.contract.address,
      );
      return logs;
    } catch (e) {
      logger.error('Query %s(%d - %d) still failed, stop!', this.contract.address, this.from, this.to);
      throw e;
    }
  }
}

export class TransferCollect extends AbstractCollect {
  protected getFilter (parameter: Array<Array<string | null> | string | null>) {
    return this.contract.filters.Transfer(...parameter);
  }
}

export class SwapCollect extends AbstractCollect {
  protected getFilter (parameter: Array<Array<string | null> | string | null>): EventFilter {
    return this.contract.filters.Swap(...parameter);
  }
}

export class PairCreatedCollect extends AbstractCollect {
  protected getFilter (parameter: Array<Array<string | null> | string | null>): EventFilter {
    return this.contract.filters.PairCreated(...parameter);
  }
}
