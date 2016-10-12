'use strict'

const path = require('path')
const fs = require('fs')

const now = require('observe-now')

const npm = require('./npm')
const registry = require('./registry')
const command = require('./command')

var data = exports.data = {}

function resetData () {
  data.deployments = []
  data.servicesFlat = []
  data.rootDir = ''
  data.env = ''
}

exports.deployAll = (dir, env) => {
  resetData()

  data.rootDir = dir
  data.env = env || ''
  var pkg = exports.getPkg(dir)

  registry.setHost(process.env.REGISTRY_HOST)

  var rootService

  return registry.getList()
    .then((list) => { data.deployments = list })
    .then(() => exports.addDependencies(exports.addService(pkg.name, pkg.version), pkg.services || {}))
    .then(() => {
      var other = data.servicesFlat.find(service => service.name === pkg.name && service.version !== pkg.version)

      if (other) {
        throw new Error(`Can not depend on a different version of root module: ${other.name}@${other.version}`)
      }

      // take the root service out of flat array
      rootService = data.servicesFlat.shift()

      // prepare install string
      const install = data.servicesFlat.filter(s => s.deploy).map(s => `${s.name}@${s.version}`).join(' ')

      if (install.length) {
        // npm install all together
        console.log(`NowFleet: npm installing ${install}...`)
        return command.run(`npm install ${install}`, dir)
      }
    })
    // then deploy all the other services in the tree
    .then(() => Promise.all(data.servicesFlat.map(deploy)))
    // prepare package for the root service last
    .then(() => preparePkg(rootService, data.rootDir))
}

exports.discoverAll = (pkg, delay) => {
  resetData()

  if (!pkg._services) { return Promise.resolve({}) }

  registry.setHost(process.env.REGISTRY_HOST)

  return registry.getList()
    .then((deployments) => {
      const notDiscovered = Object.keys(pkg._services).find(name => {
        const service = pkg._services[name]

        if (service.constructor === String) {
          return false
        }

        const found = deployments.find(
          d => d.name === name && d.version === service.version && d.env === pkg._env && d.created > service.lastDeploy
        )

        if (found) {
          pkg._services[name] = found.url
        }

        return !found
      })

      // Check if we still have any services not discovered
      if (notDiscovered) {
        return (new Promise(resolve => setTimeout(resolve, delay)))
          .then(() => exports.discoverAll(pkg, delay))
      }

      return pkg
    })
}

exports.addService = (name, version) => {
  var service = {
    name, version,
    dependants: [], dependencies: [],
    deploy: true, lastDeploy: 0, lastUrl: ''
  }
  data.servicesFlat.push(service)

  const found = data.deployments.find(d => d.name === name && d.version === version && d.env === data.env)

  if (found) {
    service.lastDeploy = found.created
    service.lastUrl = found.url
    service.deploy = false
  }

  return service
}

exports.addDependencies = (dependant, dependencies) => {
  return Promise.all(Object.keys(dependencies).map(name => {
    var version = dependencies[name]

    return npm.getLastVersion(`${name}@${version}`)
      .then(latest => {
        var dependency = data.servicesFlat.find(s => s.name === name && s.version === latest)

        if (dependency) {
          // just wire it, if same version of this service is already in flat list
          return wireDependency(dependant, dependency)
        }

        dependency = exports.addService(name, latest)

        wireDependency(dependant, dependency)

        // go for dependencies recursively
        return npm.getServices(`${name}@${latest}`)
          .then(services => exports.addDependencies(dependency, services))
      })
  }))
}

function deploy (service) {
  if (!service.deploy) {
    // skip service if it does not need a deploy
    return
  }

  // calculate the local directory of module
  const dir = path.join(data.rootDir, 'node_modules', service.name)

  preparePkg(service, dir)

  fs.writeFileSync(path.join(dir, '.npmrc'), `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}`)
  var env = { REGISTRY_HOST: process.env.REGISTRY_HOST }
  data.env.split('&').forEach(pair => {
    const [key, val] = pair.split('=')
    env[key] = val
  })

  console.log(`NowFleet: deploying ${service.name}@${service.version} with ${data.env}`)

  return new Promise((resolve, reject) => {
    const sdep = now.deploy(dir, env, process.env.NOW_TOKEN)
      .on('deployed', () => {
        console.log(`NowFleet: ${service.name}@${service.version} deployed:`, sdep.url.compute(), 'waiting until ready...')
      })
      .on('ready', () => {
        console.log(`NowFleet: ${service.name}@${service.version} is ready.`)
        service.lastUrl = sdep.url.compute().replace(/^https:\/\//, '')
        service.deploy = false
        resolve()
      })
      .on('error', reject)
      .deploy()
  })
    .then(() => command.run(`rm -r ${dir}`))
}

function wireDependency (dependant, dependency) {
  dependency.dependants.push(dependant)
  dependant.dependencies.push(dependency)
  if (dependency.deploy) {
    deployDependant(dependant)
  }
}

function deployDependant (dependant) {
  // stop when a marked dependant found
  // this is necessary to avoid indefinite recursion
  if (dependant.deploy) { return }

  dependant.deploy = true

  // mark dependents of dependents to deploy recursively
  dependant.dependants.forEach(deployDependant)
}

function preparePkg (service, dir) {
  var _services = {}
  service.dependencies.forEach(dependency => {
    _services[dependency.name] = dependency.deploy ? {
      // discovery will try finding this version of service
      // deployed after lastDeploy time
      version: dependency.version,
      lastDeploy: dependency.lastDeploy

      // set the url directly if we already know it
    } : dependency.lastUrl
  })
  var pkg = exports.getPkg(dir)
  pkg._services = _services
  pkg._env = data.env
  delete pkg.devDependencies
  exports.setPkg(dir, pkg)
}

exports.getPkg = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json')))
exports.setPkg = (dir, pkg) => fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
