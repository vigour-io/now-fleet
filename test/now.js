'use strict'
const test = require('tape')
const sinon = require('sinon')
const https = require('https')

const now = require('../lib/now')

const https_request_options = {
  hostname: 'api.zeit.co',
  port: 443,
  method: 'GET',
  headers: {
    'Authorization': 'Bearer: API-TOKEN'
  }
}

const stub = sinon.stub(https, 'request')

now.set_token('API-TOKEN')

test('now client - get deployments list', (t) => {
  stub
    .withArgs(Object.assign({path: '/now/deployments'}, https_request_options))
    .returns({end: () => {}})
    .callsArgWith(1, {on: (e, cb) => {
      cb(e == 'data' && '{"deployments": []}')
    }})

  now.get_deployments((list) => {
    t.equal(list.constructor, Array, 'deployments is an array')
    t.equal(list.length, 0, 'with zero items')
    t.end()
  })
})

test('now client - get package.json', (t) => {
  stub
    .withArgs(Object.assign({path: '/now/deployments/deployment-uid/files'}, https_request_options))
    .returns({end: () => {}})
    .callsArgWith(1, {on: (e, cb) => {
      cb(e == 'data' && '[{"name": "package.json", "uid": "pkg-uid"}]')
    }})

  stub
    .withArgs(Object.assign({path: '/now/deployments/deployment-uid/files/pkg-uid'}, https_request_options))
    .returns({end: () => {}})
    .callsArgWith(1, {on: (e, cb) => {
      cb(e == 'data' && '{"version": "1.1.1"}')
    }})

  now.get_pkg('deployment-uid', (pkg) => {
    t.equal(pkg.constructor, Object, 'package.json is an object')
    t.pass(pkg.version, 'with a version')
    t.end()
    https.request.restore()
  })
})
