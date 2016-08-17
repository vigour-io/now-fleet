'use strict'

const test = require('tape')
const sinon = require('sinon')
const https = require('https')

const registry = require('../lib/registry')

const httpsRequestOptions = {
  hostname: 'REGISTRY-HOST',
  path: '/',
  port: 443,
  method: 'GET'
}

const request = sinon.stub(https, 'request')

test('registry client - catch connection error', t => {
  request
    .withArgs(httpsRequestOptions)
    .returns({end: () => {}, on: (e, cb) => {
      cb('connection error')
    }})

  registry.setHost('REGISTRY-HOST')
  registry.getList()
    .catch(error => {
      t.equal(error, 'connection error', 'connection error caught')
      t.end()
    })
})

test('registry client - invalid json', t => {
  request
    .withArgs(httpsRequestOptions)
    .returns({end: () => {}})
    .callsArgWith(1, {on: (e, cb) => {
      cb(e === 'data' && 'not a valid json')
    }})

  registry.setHost('REGISTRY-HOST')
  registry.getList()
    .then(list => {
      t.equal(list.constructor, Array, 'deployments is an array')
      t.equal(list.length, 0, 'with zero items')
      t.end()
    })
})

test('registry client - get deployments list', t => {
  request
    .withArgs(httpsRequestOptions)
    .returns({end: () => {}})
    .callsArgWith(1, {on: (e, cb) => {
      cb(e === 'data' && '[]')
    }})

  registry.setHost('REGISTRY-HOST')
  registry.getList()
    .then(list => {
      t.equal(list.constructor, Array, 'deployments is an array')
      t.equal(list.length, 0, 'with zero items')
      t.end()
    })
})

test.onFinish(() => {
  https.request.restore()
})
