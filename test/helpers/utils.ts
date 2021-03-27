import {BigNumber, BigNumberish, utils} from 'ethers'

export const generateAccounts = (count: number) => {
  return Array.from({length: count}, _ => {
    const privateKey = '0x' + Buffer.from(utils.randomBytes(32)).toString('hex')
    return new utils.SigningKey(privateKey)
  })
}

export const splitToRandomNum = (total: number, n: number) => {
  const res = []
  let range = total
  let current = 0
  for (let i = 0; i < n - 1; i++) {
    const item = Math.ceil(Math.random() * (range / 2))
    res.push(item)
    range -= item
    current += item
  }
  res.push(total - current)
  return res
}
