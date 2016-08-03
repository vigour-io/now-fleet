'use strict'

const test = require('tape')
const sinon = require('sinon')
const https = require('https')

const now = require('../lib/now')

const httpsRequestOptions = {
  hostname: 'api.zeit.co',
  port: 443,
  method: 'GET',
  headers: {
    'Authorization': 'Bearer: API-TOKEN'
  }
}

const request = sinon.stub(https, 'request')

test('now client - get deployments list', t => {
  request
    .withArgs(Object.assign({
      path: '/now/deployments'
    }, httpsRequestOptions))
    .returns({end: () => {}})
    .callsArgWith(1, {on: (e, cb) => {
      cb(e === 'data' && '{"deployments": []}')
    }})

  now.setToken('API-TOKEN')
  now.getDeployments()
    .then(list => {
      t.equal(list.constructor, Array, 'deployments is an array')
      t.equal(list.length, 0, 'with zero items')
      t.end()
    })
})

test('now client - get package.json', t => {
  request
    .withArgs(Object.assign({
      path: '/now/deployments/deployment-uid/files'
    }, httpsRequestOptions))
    .returns({end: () => {}})
    .callsArgWith(1, {on: (e, cb) => {
      cb(e === 'data' && '[{"name": "package.json", "uid": "pkg-uid"}]')
    }})

  request
    .withArgs(Object.assign({
      path: '/now/deployments/deployment-uid/files/pkg-uid'
    }, httpsRequestOptions))
    .returns({end: () => {}})
    .callsArgWith(1, {on: (e, cb) => {
      cb(e === 'data' && '{"version": "1.1.1"}')
    }})

  now.setToken('API-TOKEN')
  now.getPkg('deployment-uid')
    .then(pkg => {
      t.equal(pkg.constructor, Object, 'package.json is an object')
      t.equal(pkg.version, '1.1.1', 'version is 1.1.1')
      t.end()
    })
})

test.onFinish(() => {
  https.request.restore()
})
