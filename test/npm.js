'use strict'

const test = require('tape')
const sinon = require('sinon')
const cp = require('child_process')

const npm = require('../lib/npm')

const stub = sinon.stub(cp, 'exec')

test('npm client - get latest version', t => {
  stub
    .withArgs('npm v sample@^1.0.0 version')
    .callsArgWith(2, null, '\nsample@1.1.1 \'1.1.1\'\nsample@1.2.2 \'1.2.2\'\nsample@1.3.3 \'1.3.3\'\n')

  npm.getLastVersion('sample@^1.0.0')
    .then(version => {
      t.equal(version.constructor, String, 'latest version is a string')
      t.equal(version, '1.3.3', 'latest version is 1.3.3')
      t.end()
    })
})

test('npm client - get services', t => {
  stub
    .withArgs('npm v sample@1.3.3 services')
    .callsArgWith(2, null, '\n{"sample2": "^2.0.0"}\n')

  npm.getServices('sample@1.3.3')
    .then(services => {
      t.equal(services.constructor, Object, 'services is an object')
      t.equal(services.sample2, '^2.0.0', 'sample2@^2.0.0 is a service dependency')
      t.end()
    })
})
