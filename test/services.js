'use strict'

const test = require('tape')
const sinon = require('sinon')
const path = require('path')
const fs = require('fs')

const Services = require('../lib/services')
const now = require('../lib/now')
const npm = require('../lib/npm')
const command = require('../lib/command')

process.env.NOW_TOKEN = 'API-TOKEN'
const services = new Services()

const deployments = [
  { uid: 1, name: 's1', url: 'u1.sh', created: 11 }, // v1
  { uid: 2, name: 's1', url: 'u2.sh', created: 12 }, // v1
  { uid: 3, name: 's1', url: 'u3.sh', created: 13 }, // v1
  { uid: 4, name: 's1', url: 'u4.sh', created: 21 }, // v2
  { uid: 5, name: 's1', url: 'u5.sh', created: 22 }, // v2
  { uid: 6, name: 's2', url: 'u6.sh', created: 11 }, // v1
  { uid: 7, name: 's2', url: 'u7.sh', created: 21 }, // v2
  { uid: 8, name: 's2', url: 'u8.sh', created: 22 }, // v2
  { uid: 9, name: 's3', url: 'u9.sh', created: 11 }, // v1
  { uid: 10, name: 's4', url: 'u10.sh', created: 11 }, // v1
  { uid: 99, name: 's10', url: 'u99.sh', created: 11 } // no v
]

function stubGetPkg () {
  const getPkg = sinon.stub(now, 'getPkg')
  getPkg.withArgs(1).returns(Promise.resolve({ version: '1' }))
  getPkg.withArgs(2).returns(Promise.resolve({ version: '1' }))
  getPkg.withArgs(3).returns(Promise.resolve({ version: '1' }))
  getPkg.withArgs(4).returns(Promise.resolve({ version: '2' }))
  getPkg.withArgs(5).returns(Promise.resolve({ version: '2' }))
  getPkg.withArgs(6).returns(Promise.resolve({ version: '1' }))
  getPkg.withArgs(7).returns(Promise.resolve({ version: '2' }))
  getPkg.withArgs(8).returns(Promise.resolve({ version: '2' }))
  getPkg.withArgs(9).returns(Promise.resolve({ version: '1' }))
  getPkg.withArgs(10).returns(Promise.resolve({ version: '1' }))
  getPkg.withArgs(11).returns(Promise.resolve({ version: '2' }))
  getPkg.withArgs(12).returns(Promise.resolve({ version: '1' }))
  getPkg.withArgs(99).returns(Promise.resolve({}))
}

test('services - find last deployments', t => {
  stubGetPkg()

  services.deployments = deployments
  services.findLastDeployments()
    .then(() => {
      t.deepEqual(services.lastDeployments, {
        's1@1': { uid: 3, name: 's1', url: 'u3.sh', created: 13 },
        's1@2': { uid: 5, name: 's1', url: 'u5.sh', created: 22 },
        's1': 22,
        's2@1': { uid: 6, name: 's2', url: 'u6.sh', created: 11 },
        's2@2': { uid: 8, name: 's2', url: 'u8.sh', created: 22 },
        's2': 22,
        's3@1': { uid: 9, name: 's3', url: 'u9.sh', created: 11 },
        's3': 11,
        's4@1': { uid: 10, name: 's4', url: 'u10.sh', created: 11 },
        's4': 11
      }, 'last deployments are as expected')
      t.end()

      now.getPkg.restore()
    })
})

test('services - prepare flat services list', t => {
  sinon.stub(npm, 'getLastVersion', v => Promise.resolve(v.split('@').pop().slice(1)))

  const getServices = sinon.stub(npm, 'getServices')
  getServices.withArgs('s2@2').returns(Promise.resolve({}))
  getServices.withArgs('s3@1').returns(Promise.resolve({ 's4': '^2' }))
  getServices.withArgs('s4@2').returns(Promise.resolve({ 's2': '^2' }))

  services.servicesFlat = []
  services.addDependencies(services.addService('s1', '2'), { 's2': '^2', 's3': '^1' })
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
        deploy: true, lastDeploy: 11, lastUrl: ''
      }

      var dependencies = {}
      services.servicesFlat.forEach(service => {
        dependencies[service.name] = {
          dependencies: service.dependencies.length,
          dependants: service.dependants.length
        }
        // can not check dependencies with deep equal
        // because it has self reference
        delete service.dependants
        delete service.dependencies
      })
      t.deepEqual(services.servicesFlat, [s1, s2, s3, s4], 'flat services list is as expected')
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

  services.servicesFlat = []
  services.addDependencies(services.addService('s1', '1'), { 's2': '^3' })
    .then(() => {
      var s1 = {
        name: 's1', version: '1',
        deploy: true, lastDeploy: 22, lastUrl: 'u3.sh'
      }
      var s2 = {
        name: 's2', version: '3',
        deploy: true, lastDeploy: 22, lastUrl: ''
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
      services.servicesFlat.forEach(service => {
        dependencies[service.name] = {
          dependencies: service.dependencies.length,
          dependants: service.dependants.length
        }
        // can not check dependencies with deep equal
        // because it has self reference
        delete service.dependants
        delete service.dependencies
      })
      t.deepEqual(services.servicesFlat, [s1, s2, s3, s4], 'flat services list is as expected')
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
  const getDeployments = sinon.stub(now, 'getDeployments')
  getDeployments.returns(Promise.resolve(deployments))

  stubGetPkg()

  const getPkg = sinon.stub(Services, 'getPkg')
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

  services.servicesFlat = []
  services.deployAll('directory')
    .catch((error) => {
      t.equal(error.message, 'Can not depend on a different version of root module: s1@1', 'error caught')
      t.end()

      now.getDeployments.restore()
      now.getPkg.restore()
      npm.getLastVersion.restore()
      npm.getServices.restore()
      Services.getPkg.restore()
    })
})

test('services - deploy all successfuly', t => {
  const getDeployments = sinon.stub(now, 'getDeployments')
  getDeployments.returns(Promise.resolve(deployments))

  stubGetPkg()

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
    writeFileSyncArgs[path.parse(file).dir] = JSON.parse(data)
  })

  var commandArgs = {}
  sinon.stub(command, 'run', function (cmd, cwd) {
    cwd = cwd || 'no-cwd'
    if (!commandArgs[cwd]) {
      commandArgs[cwd] = []
    }
    commandArgs[cwd].push(cmd)

    if (cmd === 'now' && cwd === 'directory') {
      return Promise.resolve('Ready! https://dummy-url.sh ')
    }

    return Promise.resolve()
  })

  services.servicesFlat = []
  services.deployAll('directory')
    .then(() => {
      t.deepEqual(writeFileSyncArgs, {
        'directory': {
          name: 's1', version: '2',
          services: { 's2': '^2', 's3': '^1' },
          _services: {
            's2': 'u8.sh',
            's3': { version: '1', lastDeploy: 11 }
          },
          _now_token: 'API-TOKEN'
        },
        'directory/node_modules/s3': { _services: { 's4': { version: '2', lastDeploy: 11 } }, _now_token: 'API-TOKEN' },
        'directory/node_modules/s4': { _services: { 's2': 'u8.sh' }, _now_token: 'API-TOKEN' }
      })
      t.deepEqual(commandArgs, {
        'directory': [ 'npm install', 'now', 'npm install s3@1', 'npm install s4@2' ],
        'directory/node_modules/s3': [ 'npm install', 'now' ],
        'directory/node_modules/s4': [ 'npm install', 'now' ],
        'no-cwd': [ 'rm -r directory/node_modules/s3', 'rm -r directory/node_modules/s4' ]
      })
      t.end()

      now.getDeployments.restore()
      now.getPkg.restore()
      npm.getLastVersion.restore()
      npm.getServices.restore()
      fs.readFileSync.restore()
      fs.writeFileSync.restore()
      command.run.restore()
    })
})

test('services - discover services', t => {
  const s4New = { uid: 11, name: 's4', url: 'u11.sh', created: 12 }
  const s3New = { uid: 12, name: 's3', url: 'u12.sh', created: 12 }

  const getDeployments = sinon.stub(now, 'getDeployments')
  getDeployments.onFirstCall().returns(Promise.resolve(deployments.concat(s4New)))
  getDeployments.onSecondCall().returns(Promise.resolve(deployments.concat(s4New, s3New)))

  stubGetPkg()

  var pkg = {
    _services: {
      's2': 'u8.sh',
      's3': { version: '1', lastDeploy: 11 },
      's4': { version: '2', lastDeploy: 11 }
    },
    _now_token: 'API-TOKEN'
  }

  services.pkg = {}
  services.discoverAll(pkg, 0)
    .then((pkg) => {
      t.equal(services.deployments.length, 13, 'find 13 deployments')
      t.deepEqual(pkg._services, {
        's2': 'u8.sh',
        's3': 'u12.sh',
        's4': 'u11.sh'
      }, 'services should be discovered as expected')
      t.end()

      now.getDeployments.restore()
      now.getPkg.restore()
    })
})
