'use strict'
const test = require('tape')
const sinon = require('sinon')
const https = require('https')

const now = require('../lib/now')

test('now client', (t) => {
  let stub = sinon.stub(https, 'request')

  stub
    .withArgs({
      hostname: 'api.zeit.co',
      path: '/now/deployments',
      port: 443,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer: API-TOKEN'
      }
    })
    .returns({end: () => {}})
    .callsArgWith(1, {on: (e, cb) => {
      cb(e == 'data' ? '{"deployments": []}' : null)
    }})

  now.set_token('API-TOKEN')
  now.get_deployments((list) => {
    t.equal(list.constructor, Array, 'deployments is an array')
    t.equal(list.length, 0, 'with zero items')
    t.end()
  })
})