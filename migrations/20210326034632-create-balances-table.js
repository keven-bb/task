'use strict'

var dbm
var type
var seed

/**
 * We receive the dbmigrate dependency from dbmigrate initially.
 * This enables us to not have to rely on NODE_PATH.
 */
exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate
  type = dbm.dataType
  seed = seedLink
}

exports.up = function (db) {
  db.createTable(
    'balances',
    {
      id: {type: 'bigint', primaryKey: true, autoIncrement: true},
      tid: {type: 'bigint', notNull: true, unsigned: true},
      address: {type: 'string', notNull: true, length: 40},
      balance: {type: 'string', notNull: true, default: '0', length: 40},
    },
    err => {
      if (err) {
        throw err
      }
      db.addIndex('balances', 'tx_tid_address', ['tid', 'address'], true)
    },
  )
  return null
}

exports.down = function (db) {
  db.dropTable('balances')
  return null
}

exports._meta = {
  version: 1,
}
