'use strict'

const test = require('tape')
const sinon = require('sinon')
const path = require('path')
const fs = require('fs')

const pnpm = require('pnpm')
const now = require('observe-now')

const fleet = require('../lib/fleet')
const registry = require('../lib/registry')
const npm = require('../lib/npm')
const command = require('../lib/command')

process.env.REGISTRY_HOST = 'REGISTRY-HOST'
process.env.NPM_TOKEN = 'NPM-TOKEN'
process.env.NOW_TOKEN = 'NOW-TOKEN'

const deployments = [
  {name: 's1', version: '1', env: 'a=b', url: 'u3.sh', created: 13},
  {name: 's1', version: '1', env: 'a=c', url: 'u2.sh', created: 12},
  {name: 's1', version: '2', env: 'c=d', url: 'u4.sh', created: 21},
  {name: 's1', version: '2', env: 'a=b&c=d', url: 'u5.sh', created: 22},
  {name: 's2', version: '1', env: 'c=d', url: 'u6.sh', created: 11},
  {name: 's2', version: '2', env: 'a=b', url: 'u7.sh', created: 21},
  {name: 's2', version: '2', env: 'a=b&c=d', url: 'u8.sh', created: 22},
  {name: 's3', version: '1', env: 'a=b&c=d', url: 'u9.sh', created: 11},
  {name: 's4', version: '1', env: 'a=b&c=d', url: 'u10.sh', created: 11}
]

test('services - prepare flat services list', t => {
  sinon.stub(npm, 'getLastVersion', v => Promise.resolve(v.split('@').pop().slice(1)))

  const getServices = sinon.stub(npm, 'getServices')
  getServices.withArgs('s2@2').returns(Promise.resolve({}))
  getServices.withArgs('s3@1').returns(Promise.resolve({ 's4': '^2' }))
  getServices.withArgs('s4@2').returns(Promise.resolve({ 's2': '^2' }))

  fleet.data.deployments = deployments
  fleet.data.servicesFlat = []
  fleet.data.env = 'a=b&c=d'
  fleet.addDependencies(fleet.addService('s1', '2'), { 's2': '^2', 's3': '^1' })
    .then(() => {
      var s1 = {
        name: 's1', version: '2',
        deploy: true, lastDeploy: 22, lastUrl: 'u5.sh'
      }
      var s2 = {
        name: 's2', version: '2',
        deploy: false, lastDeploy: 22, lastUrl: 'u8.sh'
      }
      var s3 = {
        name: 's3', version: '1',
        deploy: true, lastDeploy: 11, lastUrl: 'u9.sh'
      }
      var s4 = {
        name: 's4', version: '2',
        deploy: true, lastDeploy: 0, lastUrl: ''
      }

      var dependencies = {}
      fleet.data.servicesFlat.forEach(service => {
        dependencies[service.name] = {
          dependencies: service.dependencies.length,
          dependants: service.dependants.length
        }
        // can not check dependencies with deep equal
        // because it has self reference
        delete service.dependants
        delete service.dependencies
      })
      t.deepEqual(fleet.data.servicesFlat, [s1, s2, s3, s4], 'flat services list is as expected')
      t.deepEqual(dependencies, {
        s1: {dependencies: 2, dependants: 0},
        s2: {dependencies: 0, dependants: 2},
        s3: {dependencies: 1, dependants: 1},
        s4: {dependencies: 1, dependants: 1}
      }, 'dependency counts are as expected')
      t.end()

      npm.getLastVersion.restore()
      npm.getServices.restore()
    })
})

test('services - prepare flat services list for circular dependency', t => {
  sinon.stub(npm, 'getLastVersion', v => Promise.resolve(v.split('@').pop().slice(1)))

  const getServices = sinon.stub(npm, 'getServices')
  getServices.withArgs('s2@3').returns(Promise.resolve({ 's3': '^1' }))
  getServices.withArgs('s3@1').returns(Promise.resolve({ 's4': '^1' }))
  getServices.withArgs('s4@1').returns(Promise.resolve({ 's1': '^1' }))

  fleet.data.deployments = deployments
  fleet.data.servicesFlat = []
  fleet.data.env = 'a=b&c=d'
  fleet.addDependencies(fleet.addService('s1', '1'), { 's2': '^3' })
    .then(() => {
      var s1 = {
        name: 's1', version: '1',
        deploy: true, lastDeploy: 0, lastUrl: ''
      }
      var s2 = {
        name: 's2', version: '3',
        deploy: true, lastDeploy: 0, lastUrl: ''
      }
      var s3 = {
        name: 's3', version: '1',
        deploy: true, lastDeploy: 11, lastUrl: 'u9.sh'
      }
      var s4 = {
        name: 's4', version: '1',
        deploy: true, lastDeploy: 11, lastUrl: 'u10.sh'
      }

      var dependencies = {}
      fleet.data.servicesFlat.forEach(service => {
        dependencies[service.name] = {
          dependencies: service.dependencies.length,
          dependants: service.dependants.length
        }
        // can not check dependencies with deep equal
        // because it has self reference
        delete service.dependants
        delete service.dependencies
      })
      t.deepEqual(fleet.data.servicesFlat, [s1, s2, s3, s4], 'flat services list is as expected')
      t.deepEqual(dependencies, {
        s1: {dependencies: 1, dependants: 1},
        s2: {dependencies: 1, dependants: 1},
        s3: {dependencies: 1, dependants: 1},
        s4: {dependencies: 1, dependants: 1}
      }, 'dependency counts are as expected')
      t.end()

      npm.getLastVersion.restore()
      npm.getServices.restore()
    })
})

test('services - deploy all with error', t => {
  const getList = sinon.stub(registry, 'getList')
  getList.returns(Promise.resolve(deployments))

  const getPkg = sinon.stub(fleet, 'getPkg')
  getPkg.withArgs('directory').returns({
    name: 's1', version: 's2',
    services: { 's2': '^2', 's3': '^1' }
  })

  sinon.stub(npm, 'getLastVersion', v => Promise.resolve(v.split('@').pop().slice(1)))

  const getServices = sinon.stub(npm, 'getServices')
  getServices.withArgs('s2@2').returns(Promise.resolve({}))
  getServices.withArgs('s3@1').returns(Promise.resolve({ 's4': '^2' }))
  getServices.withArgs('s4@2').returns(Promise.resolve({ 's2': '^2', 's1': '^1' }))
  getServices.withArgs('s1@1').returns(Promise.resolve({}))

  fleet.data.servicesFlat = []
  fleet.deployAll('directory')
    .catch((error) => {
      t.equal(error.message, 'Can not depend on a different version of root module: s1@1', 'error caught')
      t.end()

      registry.getList.restore()
      npm.getLastVersion.restore()
      npm.getServices.restore()
      fleet.getPkg.restore()
    })
})

test('services - deploy all successfuly', t => {
  const getList = sinon.stub(registry, 'getList')
  getList.returns(Promise.resolve(deployments))

  const readFileSync = sinon.stub(fs, 'readFileSync')
  readFileSync.withArgs(path.join('directory', 'package.json')).returns(JSON.stringify({
    name: 's1', version: '2',
    services: { 's2': '^2', 's3': '^1' }
  }))
  readFileSync.returns('{}')

  sinon.stub(npm, 'getLastVersion', v => Promise.resolve(v.split('@').pop().slice(1)))

  const getServices = sinon.stub(npm, 'getServices')
  getServices.withArgs('s2@2').returns(Promise.resolve({}))
  getServices.withArgs('s3@1').returns(Promise.resolve({ 's4': '^2' }))
  getServices.withArgs('s4@2').returns(Promise.resolve({ 's2': '^2' }))

  var writeFileSyncArgs = {}
  sinon.stub(fs, 'writeFileSync', (file, data) => {
    const parsed = path.parse(file)
    if (parsed.name === '.npmrc') {
      return
    }
    writeFileSyncArgs[parsed.dir] = JSON.parse(data)
  })

  const installPkgs = sinon.stub(pnpm, 'installPkgs')
  installPkgs
    .returns(Promise.resolve())

  const run = sinon.stub(command, 'run')
  run.returns(Promise.resolve())

  function prepareDeployer (url) {
    return {
      on (e, cb) {
        if (e === 'deployed') {
          setTimeout(cb, 0)
        } else if (e === 'ready') {
          setTimeout(cb, 100)
        }
        return this
      },
      url: {
        compute () {
          return url
        }
      },
      deploy () {
        return this
      }
    }
  }

  const nowDeploy = sinon.stub(now, 'deploy')
  nowDeploy
    .withArgs('directory/node_modules/s3', {
      a: 'b', c: 'd',
      REGISTRY_HOST: 'REGISTRY-HOST'
    }, 'NOW-TOKEN')
    .returns(prepareDeployer('https://u3.sh'))

  nowDeploy
    .withArgs('directory/node_modules/s4', {
      a: 'b', c: 'd',
      REGISTRY_HOST: 'REGISTRY-HOST'
    }, 'NOW-TOKEN')
    .returns(prepareDeployer('https://u4.sh'))

  fleet.data.servicesFlat = []
  fleet.deployAll('directory', 'a=b&c=d')
    .then(() => {
      t.deepEqual(writeFileSyncArgs, {
        'directory': {
          name: 's1', version: '2',
          services: { 's2': '^2', 's3': '^1' },
          _services: {
            's2': 'u8.sh',
            's3': 'u3.sh'
          },
          _env: 'a=b&c=d'
        },
        'directory/node_modules/s3': {
          _services: {
            's4': { version: '2', lastDeploy: 0 }
          },
          _env: 'a=b&c=d'
        },
        'directory/node_modules/s4': {
          _services: {
            's2': 'u8.sh'
          },
          _env: 'a=b&c=d'
        }
      }, 'package.json files are prepared')
      t.ok(installPkgs.getCall(0).calledWith(
        { s3: '1', s4: '2' },
        { cwd: 'directory', save: false, quiet: true }
      ), 'pnpm ran as expected')
      t.ok(run.getCall(0).calledWith('rm -r directory/node_modules/s3'), 'removed s3')
      t.ok(run.getCall(1).calledWith('rm -r directory/node_modules/s4'), 'removed s4')
      t.end()

      registry.getList.restore()
      npm.getLastVersion.restore()
      npm.getServices.restore()
      fs.readFileSync.restore()
      fs.writeFileSync.restore()
      run.restore()
      installPkgs.restore()
    })
})

test('services - discover services', t => {
  const s4New = { name: 's4', version: '2', env: 'a=b&c=d', url: 'u11.sh', created: 12 }
  const s3New = { name: 's3', version: '1', env: 'a=b&c=d', url: 'u12.sh', created: 12 }

  const getList = sinon.stub(registry, 'getList')
  getList.onFirstCall().returns(Promise.resolve(deployments.concat(s4New)))
  getList.onSecondCall().returns(Promise.resolve(deployments.concat(s4New, s3New)))

  var pkg = {
    _services: {
      's2': 'u8.sh',
      's3': { version: '1', lastDeploy: 11 },
      's4': { version: '2', lastDeploy: 11 }
    },
    _env: 'a=b&c=d'
  }

  fleet.discoverAll(pkg, 0)
    .then((pkg) => {
      t.deepEqual(pkg._services, {
        's2': 'u8.sh',
        's3': 'u12.sh',
        's4': 'u11.sh'
      }, 'services should be discovered as expected')
      t.end()

      registry.getList.restore()
    })
})
