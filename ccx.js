#!/usr/bin/env node

const {PassThrough} = require('stream')
const http = require('http')
const fs = require('fs')
const StellarSdk = require('stellar-sdk')
StellarSdk.Network.usePublicNetwork()

const issueSecretKey = '' // stellar issue account
const messagesAccount = '' // public account for storing ccx

const MAX_REGISTER = 999999
const BASE_FEE = 10
const PER_CHARACTER_FEE = 10

const ut = {
  report: (mess, err) => {
    if (err) mess = 'FATAL: ' + mess
    const str = ut.timeStr(Date.now()) + ': ' + mess
    console.log(str)
    fs.writeFileSync('ccx.log', str + '\n', { flag: 'as' })
    if (err) process.exit(1)
  },

  timeStr: (time) => {
    const date = (new Date(time)).toJSON()
    return date.slice(0, 10) + ' ' + date.slice(11, 19) + ' UTC'
  }
}

const ccx = {
  stop: false,
  liveRpcPort: '3333',
  messagesRpcPort: '3334',
  pointer: null,
  register: null,
  link: {},

  init: (next) => {
    if (ccx.pointer === null || ccx.register === null) { ut.report('stellar not initialized'); return }
    next()
  },

  run: () => {
    if (ccx.stop) return
    ut.report('number of links => ' + Object.keys(ccx.link).length)
    ccx.rpc(ccx.liveRpcPort, 'get_height', {}, (res2) => {
      ccx.rpc(ccx.liveRpcPort, 'getbalance', {}, (res1) => {
        ut.report('ccx balance => ' + res1.unlocked_balance + ' + ' + res1.locked_amount)
        const height = res2.height
        ut.report('ccx height => ' + height)
        ccx.getMessages(
          ccx.messagesRpcPort,
          (output, mess, blk, time, amt, txId) => {
            if(!output && mess.slice(0, 3) === 'CCX' && mess.length === 9 + 1 + 98) ccx.link[mess.slice(0, 9)] = mess.slice(10)
          },
          () => {
            ccx.getMessages(
              ccx.liveRpcPort,
              (output, mess, blk, time, amt, txId) => {
                if (output || txId <= ccx.pointer || blk + 10 > height) return
                ut.report('new confirmed message => ' + ut.timeStr(time * 1000) + '(' + amt + ', ' + blk + ', ' + txId + '): ' + mess)
                ccx.pointer = txId
                st.setData('pointer', '' + ccx.pointer, () => {
                  ut.report('pointer set => ' + ccx.pointer)
                  if (mess.slice(0, 3) === 'ccx' && mess.length === 98) {
                    if (amt < 1000000) { ut.report('insufficient registration fee => ' + amt + '(' + blk + ', ' + txId + ')'); return }
                    ut.report('registering => ' + mess)
                    if (++ccx.register > MAX_REGISTER) throw 'register > ' + MAX_REGISTER
                    const str = '' + ccx.register
                    const code = 'CCX' + '0'.repeat(('' + MAX_REGISTER).length - str.length) + str
                    ut.report('code => ' + code)
                    st.setData('register', '' + ccx.register, () => {
                      ccx.sendCCX(mess, 10, code, () => { ut.report('registered => ' + mess) })
                      ccx.sendCCX(messagesAccount, 10, code + ' ' + mess, () => { ut.report('recorded => ' + mess) })
                    })
                  } else {
                    if (/[^2-7A-Z]/.test(mess) || mess.length !== 56 || mess[0] !== 'G') { ut.report('invalid address (' + blk + ', ' + txId + ')'); return }
                    st.sendCCX(mess, ccx.rawToCCX(amt), null, () => { ut.report('CCX sent to => ' + mess) })
                  }
                })
              },
              () => { setTimeout(ccx.run, 30000) }
            )
          }
        )
      })
    })
  },

  getMessages: (port, next, done) => {
    ccx.rpc(port, 'get_messages', {}, (res2) => {
      const messages = res2.tx_messages
      ccx.rpc(port, 'get_transfers', {}, (res1) => {
        const transfers = res1.transfers
        Object.values(messages).forEach((mess) => {
          if (mess.messages.length !== 1) { ut.report('extra messages => ' + mess.messages.length); return }
          const m = mess.messages[0].trim()
          const txId = mess.tx_id
          const trans = transfers[txId]
          if (!trans) return
          try {
            if (trans.time !== mess.timestamp) throw 'timestamp mismatch => ' + txId
            if (trans.blockIndex !== mess.block_height) throw 'block height mismatch => ' + txId
          } catch (err) { ut.report(err, true) }
          next(trans.output, m, trans.blockIndex, trans.time, trans.amount, txId)
        })
        done()
      })
    })
  },

  sendCCX: (dest, amt, memo, next) => { // amt is raw
    ut.report('sending ' + amt + ' X => ' + dest)
    if (memo) ut.report('sending memo => ' + memo)
    const d = { address: dest, amount: amt }
    if (memo) d.message = memo
    ccx.rpc(
      ccx.liveRpcPort,
      'transfer',
      { destinations: [d], fee: BASE_FEE + memo.length * PER_CHARACTER_FEE, mixin: 2, unlock_time: 0 },
      (res) => { ut.report('tx hash => ' + res.tx_hash); next() }
    )
  },

  rawToCCX: (raw) => {
    raw = raw.toString()
    const len = raw.length
    if (len < 7) raw = '0'.repeat(7 - len) + raw
    const cut = raw.length - 6
    return raw.slice(0, cut) + '.' +  raw.slice(cut)
  },

  CCXToRaw: (ccx) => { return Math.floor(1000000 * parseFloat(ccx)) },

  rpc: (port, method, params, next) => {
    ccx.request(
      port,
      '{"jsonrpc":"2.0","id":"0","method":"' + method + '","params":'+ JSON.stringify(params) + '}',
      (res) => { next(res) },
      (err) => {
        if (method === 'transfer' && err === 'Wrong amount') {
          ut.report('insuffient funds, waiting...')
          setTimeout(ccx.rpc, 30000, port, method, params, next)
        }
        else ut.report(err, true)
      }
    )
  },

  request: (port, post, resolve, reject) => {
    const obj = {
      hostname: 'localhost',
      port: port,
      method: 'POST',
      path: '/json_rpc',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': post.length,
      }
    }
    http.request(
      obj,
      (res) => {
        let data = Buffer.alloc(0)
        res.on('data', (chunk) => { data = Buffer.concat([data, chunk]) })
        res.on('end', () => {
          try {
            data = JSON.parse(data.toString())
            if (data.error) { reject(data.error.message); return }
          } catch (error) { reject(error.message); return }
          if (data.result) data = data.result
          resolve(data)
        })
      }
    ).on('error', (error) => { reject('RPC server error') }).end(post)
  }
}

const st = {
  queue: new PassThrough({ objectMode: true }),
  pipe: new PassThrough({ objectMode: true }),
  pipeClose: null,
  server: new StellarSdk.Server('https://horizon.stellar.org'),
  issueKeypair: StellarSdk.Keypair.fromSecret(issueSecretKey),
  issuePublicKey: '',
  ccx: '',
  cursor: '',

  init: (next) => {
    st.issuePublicKey = st.issueKeypair.publicKey()
    st.ccx = new StellarSdk.Asset('CCX', st.issuePublicKey)
    st.queue.on('data', (txObj) => { st.transaction (txObj) })
    st.pipe.on('data', (op) => { st.check (op) })

    ut.report('loading data')
    st.server.loadAccount(st.issuePublicKey)
    .then((issueAccount) => {
      const data = issueAccount.data_attr
      if (!data.pointer) throw 'no ccx pointer'
      ccx.pointer = parseInt(Buffer.from(data.pointer, 'base64').toString())
      ut.report('pointer => ' + ccx.pointer)
      if (!data.register) throw 'no ccx register'
      ccx.register = parseInt(Buffer.from(data.register, 'base64').toString())
      ut.report('register => ' + ccx.register)
      if (!data.cursor) throw 'no xlm cursor'
      st.cursor = Buffer.from(issueAccount.data_attr.cursor, 'base64').toString()
      ut.report('cursor => ' + st.cursor)
      next()
    })
    .catch((err) => { ut.report('error: loading issue account => ' + err.message, true) } )
  },

  run: () => { // incoming event to issue account
    st.pipeClose = st.server.operations()
    .forAccount(st.issuePublicKey)
    .cursor(st.cursor)
    .stream({ onmessage: (op) => { st.pipe.write(op) } }) // use FIFO passthrough stream to preserver order
  },

  check: (op) => {
    if (
      op.type !== 'payment' ||
      op.from === st.issuePublicKey ||
      op.asset_type !== 'credit_alphanum4' ||
      op.asset_code !== 'CCX' ||
      op.asset_issuer !== st.issuePublicKey
    ) return
    st.pipe.pause()
    st.setData('cursor', op.id, () => { st.incoming(op) })
  },

  setData: (key, value, next) => {
    if (value !== null && value.length > 64) throw 'invalid stellar data'
    ut.report('new ' + key + ' => ' + value)
    st.queue.write({
      kp: st.issueKeypair,
      op: StellarSdk.Operation.manageData({
        name: key,
        value: value
      }),
      memo: new StellarSdk.Memo('none', null),
      next: (tx) => { ut.report('tx hash => ' + tx.hash); next() }
    })
  },

  incoming: (op) => {
    st.server.transactions().transaction(op.transaction_hash).call()
    .then((tx) => {
      ut.report('incoming CCX op id => ' + op.id)
      ut.report('amount => ' + op.amount)
      ut.report('from => ' + op.from)
      ut.report('created => ' + op.created_at)
      ut.report('memo => ' + tx.memo_type + ', ' + tx.memo)
      let dest = ''
      if (tx.memo_type === 'text') { dest = ccx.link[tx.memo] }
      if (!dest) {
        ut.report('invalid memo => refund')
        st.sendCCX(op.from, op.amount, 'CCX refund', () => { ut.report('CCX refunded to => ' + op.from); st.pipe.resume() })
        return
      }
      ut.report('ConcealX payment attempt => ' + dest)
      ccx.sendCCX(dest, ccx.CCXToRaw(op.amount), tx.memo + ' redemption', () => { ut.report('CCX sent to => ' + dest); st.pipe.resume() })
    })
    .catch((err) => { ut.report('error => processing incoming CCX: ' + err.message, true) })
  },

  sendCCX: (dest, amount, memo, next) => {
    ut.report('sending ' + amount + ' CCX token => ' + dest)
    st.queue.write({
      kp: st.issueKeypair,
      op: StellarSdk.Operation.payment({
        destination: dest,
        asset: st.ccx,
        amount: amount
      }),
      memo: memo ? new StellarSdk.Memo('text', memo.slice(0, 28)) : new StellarSdk.Memo('none', null),
      next: (tx) => { ut.report('tx hash => ' + tx.hash); next() }
    })
  },

  transaction: (txObj) => {
    st.queue.pause()
    st.server.loadAccount(txObj.kp.publicKey())
    .then((account) => {
      const transaction = new StellarSdk.TransactionBuilder(account)
      .addOperation(txObj.op)
      .addMemo(txObj.memo)
      .build()
      transaction.sign(txObj.kp)
      st.server.submitTransaction(transaction)
      .then((tx) => { st.queue.resume(); txObj.next(tx) })
      .catch((err) => {
        let exit = true
        if (err.message === 'destination is invalid') exit = false
        ut.report('error: transaction submission => ' + err.message, exit)
      })
    })
    .catch((err) => { ut.report('error: loading issue account => ' + err.message, true) })
  }
}

process.on('SIGINT', () => {
  ut.report('interrupt received, begin closing')
  ccx.stop = true
  st.pipeClose()
  st.pipe.end()
})

ut.report('\nNew session')

st.init(() => { ccx.init(() => { ccx.run(); st.run() }) })

//st.init(() => { st.setData('pointer', '-1', () => {}) }) // cursor(0)
//st.init(() => { st.setData('register', '0', () => {}) }) // cursor(0)
