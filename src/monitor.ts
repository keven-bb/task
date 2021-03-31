import { IToken, Tokens } from './db/tokens';
import { Configuration } from './config';
import { Holder } from './holder';

async function update (token: IToken) {
  const latest = await Configuration.provider.getBlockNumber();
  Configuration.logger.debug('start - current: %s, latest: %s', token.current, latest);
  if (latest > token.current) {
    const holder = new Holder(token, token.current, latest);
    await holder.updateBalance();
    await Tokens.updateToken(token, latest);
  }
}

export function monitor (token: IToken) {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        await update(token);
        token = await Tokens.getTokenById(token.id);
        await monitor(token);
      } catch (e) {
        reject(e);
      }
      resolve(0);
    }, Configuration.interval);
  });
}

const [, , address] = process.argv;
if (address === '') {
  // eslint-disable-next-line no-template-curly-in-string
  console.log('command error: yarn monitor ${address}');
  process.exit(-1);
}

;(async () => {
  const startAt = new Date().getTime();
  try {
    let token = await Tokens.getTokenByAddress(address);
    await update(token);
    token = await Tokens.getTokenById(token.id);
    await monitor(token);
  } finally {
    Configuration.logger.debug(`Finish：${new Date().getTime() - startAt} ms`);
  }
})();
