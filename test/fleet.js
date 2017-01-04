'use strict'

const test = require('tape')
const sinon = require('sinon')
const path = require('path')
const fs = require('fs')

const Hub = require('brisky-hub')
const now = require('observe-now')

const fleet = require('../lib/fleet')
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

const registryDeployments = new Hub({
  1: { name: 's1', url: 'u1.sh', created: 11, pkg: { version: '1', env: 'a=b', routes: {}, wrapper: {} } },
  2: { name: 's1', url: 'u2.sh', created: 12, pkg: { version: '1', env: 'a=c', routes: {}, wrapper: {} } },
  3: { name: 's1', url: 'u3.sh', created: 13, pkg: { version: '1', env: 'a=b', routes: {}, wrapper: {} } },
  4: { name: 's1', url: 'u4.sh', created: 21, pkg: { version: '2', env: 'c=d', routes: {}, wrapper: {} } },
  5: { name: 's1', url: 'u5.sh', created: 22, pkg: { version: '2', env: 'a=b&c=d', routes: {}, wrapper: {} } },
  6: { name: 's2', url: 'u6.sh', created: 11, pkg: { version: '1', env: 'c=d', routes: {}, wrapper: {} } },
  7: { name: 's2', url: 'u7.sh', created: 21, pkg: { version: '2', env: 'a=b', routes: {}, wrapper: {} } },
  8: { name: 's2', url: 'u8.sh', created: 22, pkg: { version: '2', env: 'a=b&c=d', routes: {}, wrapper: {} } },
  9: { name: 's3', url: 'u9.sh', created: 11, pkg: { version: '1', env: 'a=b&c=d', routes: {}, wrapper: {} } },
  10: { name: 's4', url: 'u10.sh', created: 11, pkg: { version: '1', env: 'a=b&c=d', routes: {}, wrapper: {} } },
  99: { name: 's10', url: 'u99.sh', created: 11, pkg: {} }
})

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
  const subscribe = sinon.stub(Hub.prototype, 'subscribe')
  const get = sinon.stub(Hub.prototype, 'get')

  subscribe
    .withArgs({ deployments: { val: true } })
    .callsArg(1)

  get
    .withArgs('deployments')
    .returns(registryDeployments)

  sinon.stub(npm, 'getLastVersion', v => Promise.resolve(v.split('@').pop().slice(1)))

  const getServices = sinon.stub(npm, 'getServices')
  getServices.withArgs('s2@2').returns(Promise.resolve({}))
  getServices.withArgs('s3@1').returns(Promise.resolve({ 's4': '^2' }))
  getServices.withArgs('s4@2').returns(Promise.resolve({ 's2': '^2', 's1': '^1' }))
  getServices.withArgs('s1@1').returns(Promise.resolve({}))

  const pkg = {
    name: 's1', version: 's2',
    services: { 's2': '^2', 's3': '^1' }
  }
  fleet.data.servicesFlat = []
  fleet.getServices(pkg, 'directory')
    .catch((error) => {
      t.equal(error.message, 'Can not depend on a different version of root module: s1@1', 'error caught')
      t.end()

      subscribe.restore()
      get.restore()
      npm.getLastVersion.restore()
      npm.getServices.restore()
    })
})

test('services - deploy all successfuly', t => {
  const subscribe = sinon.stub(Hub.prototype, 'subscribe')
  const get = sinon.stub(Hub.prototype, 'get')

  subscribe
    .withArgs({ deployments: { val: true } })
    .callsArg(1)

  get
    .withArgs('deployments')
    .returns(registryDeployments)

  const pkg = {
    name: 's1', version: '2',
    services: { 's2': '^2', 's3': '^1' }
  }

  const readFileSync = sinon.stub(fs, 'readFileSync')
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

  const run = sinon.stub(command, 'run')
  run.returns(Promise.resolve())

  const nowDeploy = sinon.stub(now, 'deployment')
  const nowDeployment = nowDeploy.withArgs('NOW-TOKEN')

  nowDeployment
    .onFirstCall()
    .returns({
      on (e, cb) {
        if (e !== 'error') {
          setImmediate(cb)
        }
        return this
      },
      deploy (dir, env) {
        t.deepEqual(env, { a: 'b', c: 'd', REGISTRY_HOST: 'REGISTRY-HOST' }, 'deploys with right env')
        t.equal(dir, path.join('directory', 'node_modules', 's3'), 'deploys s3 folder')
        return this
      },
      get (key) {
        return {
          compute () {
            return {
              url: 'u3.sh',
              id: 's3'
            }[ key ]
          }
        }
      },
      set () {}
    })

  nowDeployment
    .onSecondCall()
    .returns({
      on (e, cb) {
        if (e !== 'error') {
          setImmediate(cb)
        }
        return this
      },
      deploy (dir, env) {
        t.deepEqual(env, { a: 'b', c: 'd', REGISTRY_HOST: 'REGISTRY-HOST' }, 'deploys with right env')
        t.equal(dir, path.join('directory', 'node_modules', 's4'), 'deploys s4 folder')
        return this
      },
      get (key) {
        return {
          compute () {
            return {
              url: 'u4.sh',
              id: 's4'
            }[ key ]
          }
        }
      },
      set () {}
    })

  fleet.data.servicesFlat = []
  fleet.getServices(pkg, 'directory', 'a=b&c=d')
    .then(() => {
      t.deepEqual(writeFileSyncArgs, {
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
      t.ok(run.getCall(0).calledWith('npm install s3@1 s4@2', 'directory'), 'npm installed services')
      t.ok(run.getCall(1).calledWith('rm -r directory/node_modules/s3'), 'removed s3')
      t.ok(run.getCall(2).calledWith('rm -r directory/node_modules/s4'), 'removed s4')
      t.end()

      subscribe.restore()
      get.restore()
      npm.getLastVersion.restore()
      npm.getServices.restore()
      fs.readFileSync.restore()
      fs.writeFileSync.restore()
      run.restore()
      nowDeploy.restore()
    })
})

test('services - discover services', t => {
  const subscribe = sinon.stub(Hub.prototype, 'subscribe')
  const get = sinon.stub(Hub.prototype, 'get')

  subscribe
    .withArgs({ deployments: { val: true } })
    .callsArg(1)

  get
    .withArgs('deployments')
    .returns(registryDeployments)

  var pkg = {
    _services: {
      's2': 'u8.sh',
      's3': { version: '1', lastDeploy: 11 },
      's4': { version: '2', lastDeploy: 11 }
    },
    _env: 'a=b&c=d'
  }

  fleet.getServices(pkg, 1)
    .then((pkg) => {
      t.deepEqual(pkg._services, {
        's2': 'u8.sh',
        's3': 'u12.sh',
        's4': 'u11.sh'
      }, 'services should be discovered as expected')
      t.end()

      subscribe.restore()
      get.restore()
    })

  const s4New = { 11: { name: 's4', url: 'u11.sh', created: 12, pkg: { version: '2', env: 'a=b&c=d', routes: {}, wrapper: {} } } }
  const s3New = { 12: { name: 's3', url: 'u12.sh', created: 12, pkg: { version: '1', env: 'a=b&c=d', routes: {}, wrapper: {} } } }

  setTimeout(() => {
    registryDeployments.set(s4New)
    setTimeout(() => {
      registryDeployments.set(s3New)
    }, 300)
  }, 300)
})
