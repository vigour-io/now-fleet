'use strict'

const path = require('path')
const fs = require('fs')

const npm = require('./npm')
const registry = require('./registry')
const command = require('./command')

module.exports = class Services {
  constructor () {
    this.deployments = []
    this.servicesFlat = []
    this.rootDir = ''
    this.env = ''
  }
  deployAll (dir, env) {
    this.rootDir = dir
    this.env = env || ''
    var pkg = Services.getPkg(dir)

    registry.setHost(process.env.REGISTRY_HOST)

    return registry.getList()
      .then((deployments) => { this.deployments = deployments })
      .then(() => this.addDependencies(this.addService(pkg.name, pkg.version), pkg.services || {}))
      .then(() => {
        var other = this.servicesFlat.find(service => service.name === pkg.name && service.version !== pkg.version)

        if (other) {
          throw new Error(`Can not depend on a different version of root module: ${other.name}@${other.version}`)
        }
      })
      // deployment of root service should start first
      .then(() => {
        var rootService = this.servicesFlat.shift()

        // force deploy
        rootService.deploy = true
        this.deploy(rootService)
      })
      // then all the others in the tree
      .then(() => Promise.all(this.servicesFlat.map(this.deploy.bind(this))))
  }
  discoverAll (pkg, delay) {
    // set environment variables in place
    if (pkg._env) {
      pkg._env.split('&').forEach(pair => {
        const [key, val] = pair.split('=')
        process.env[key] = val
      })
    }

    if (!pkg._registry_host || !pkg._services) { return Promise.resolve({}) }

    registry.setHost(pkg._registry_host)

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
            .then(this.discoverAll.bind(this, pkg, delay))
        }

        return pkg
      })
  }
  addService (name, version) {
    var service = {
      name, version,
      dependants: [], dependencies: [],
      deploy: true, lastDeploy: 0, lastUrl: ''
    }
    this.servicesFlat.push(service)

    const found = this.deployments.find(d => d.name === name && d.version === version && d.env === this.env)

    if (found) {
      service.lastDeploy = found.created
      service.lastUrl = found.url
      service.deploy = false
    }

    return service
  }
  addDependencies (dependant, dependencies) {
    return Promise.all(Object.keys(dependencies).map(name => {
      var version = dependencies[name]

      return npm.getLastVersion(`${name}@${version}`)
        .then(latest => {
          var dependency = this.servicesFlat.find(s => s.name === name && s.version === latest)

          if (dependency) {
            // just wire it, if same version of this service is already in flat list
            return Services.wireDependency(dependant, dependency)
          }

          dependency = this.addService(name, latest)

          Services.wireDependency(dependant, dependency)

          // go for dependencies recursively
          return npm.getServices(`${name}@${latest}`)
            .then(services => this.addDependencies(dependency, services))
        })
    }))
  }
  deploy (service) {
    if (!service.deploy) {
      // skip service if it does not need a deploy
      return
    }

    // flag to check if we're deploying the root service of tree
    const root = this.servicesFlat.indexOf(service) === -1

    // calculate the local directory of module
    const dir = root ? this.rootDir : path.join(this.rootDir, 'node_modules', service.name)

    return (root ? Promise.resolve() : command.run(`npm install ${service.name}@${service.version}`, this.rootDir))
      .then(() => {
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
        var pkg = Services.getPkg(dir)
        pkg._services = _services
        pkg._registry_host = process.env.REGISTRY_HOST
        pkg._env = this.env
        delete pkg.devDependencies
        Services.setPkg(dir, pkg)

        fs.writeFileSync(path.join(dir, '.npmrc'), `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}`)

        return root ? true : command.run('now -N', dir)
      })
      .then(() => root ? true : command.run(`rm -r ${dir}`))
  }
  static wireDependency (dependant, dependency) {
    dependency.dependants.push(dependant)
    dependant.dependencies.push(dependency)
    if (dependency.deploy) {
      Services.deployDependant(dependant)
    }
  }
  static deployDependant (dependant) {
    // stop when a marked dependant found
    // this is necessary to avoid indefinite recursion
    if (dependant.deploy) { return }

    dependant.deploy = true

    // mark dependents of dependents to deploy recursively
    dependant.dependants.forEach(Services.deployDependant)
  }
  static getPkg (dir) {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json')))
  }
  static setPkg (dir, pkg) {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  }
}
