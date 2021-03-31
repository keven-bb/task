import { Holder } from './holder';
import { Configuration } from './config';
import { Tokens } from './db/tokens';

const [, , address, fromStr] = process.argv;
if (address === '' || fromStr === '') {
  // eslint-disable-next-line no-template-curly-in-string
  console.log('command error: yarn update ${tokenAddress} ${fromBlock}');
  process.exit(-1);
}

;(async () => {
  const startAt = new Date().getTime();
  try {
    const from = parseInt(fromStr);

    const token = await Tokens.addToken(address, from);
    const latest = await Configuration.provider.getBlockNumber();
    const holder = new Holder(token, token.current, latest);
    await holder.addAddress();
    await holder.updateBalanceInDB();
  } finally {
    Configuration.logger.debug(`Finish：${new Date().getTime() - startAt} ms`);
    process.exit(0);
  }
})();
