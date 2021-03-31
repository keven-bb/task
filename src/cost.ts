import { Price } from './price';
import { Cost } from './cost-class';

(async () => {
  const [, , client, token] = process.argv;
  if (client === '' || token === '') {
    // eslint-disable-next-line no-template-curly-in-string
    console.log('command error: yarn cost ${clientAddress} ${tokenAddress}');
    process.exit(-1);
  }

  await Price.init();
  const { hold, cost } = await new Cost(client, token).start();
  console.log({ hold: hold.toString(), cost: cost.toString() });
})();
