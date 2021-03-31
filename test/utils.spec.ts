import { assert } from 'chai';
import { GanacheFixture } from './helpers/ganache';
import { Configuration } from '../src/config';
import { BigNumber, Contract, ContractFactory, utils } from 'ethers';
import { abi, byteCode } from '../src/erc20.json';
import { generateAccounts, splitToRandomNum } from './helpers/utils';
import { TransferCollect } from '../src/transfer-collect';
import { extractTransferAddress, getPrice, timestampToDateTimestamp } from '../src/utils';

describe('Util Test', () => {
  beforeEach(async () => {
    await GanacheFixture.start();
  });

  it('extract address', async () => {
    const wallet = Configuration.wallet;
    const contractFactory = new ContractFactory(abi, byteCode, wallet);
    const token = await contractFactory.deploy('Token', 'Token');

    const eventCollector = new TransferCollect(token, 0, 1000);

    const total = 10000;
    const count = 15;
    await token.mint(Configuration.wallet.getAddress(), BigNumber.from(total));
    const accounts = generateAccounts(count);
    const transfers = splitToRandomNum(total / 2, count);
    for (let i = 0; i < count; i++) {
      await token.transfer(utils.computeAddress(accounts[i].publicKey), BigNumber.from(transfers[i]));
      await token.transfer(utils.computeAddress(accounts[i].publicKey), BigNumber.from(transfers[i]));
    }
    const result = await eventCollector.getEvents();
    assert.equal(count * 2 + 1, result.events.length);

    const re = extractTransferAddress(result);
    assert.equal(accounts.length + 1, re.addresses.length);
  });

  it('token price test', async () => {
    const token = new Contract('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', abi, Configuration.provider);
    const price = await getPrice(token, 1590364800);
    assert.equal('203.9424846564098624190506562846751', price.toString());
  });

  it('timestamp to date timestamp', () => {
    assert.equal(timestampToDateTimestamp(1617171792), 1617148800);
  });

  afterEach(async () => {
    await GanacheFixture.stop();
  });
});
