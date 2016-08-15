'use strict'

const path = require('path')
const fs = require('fs')

const npm = require('./npm')
const now = require('./now')
const command = require('./command')

module.exports = class Services {
  constructor () {
    this.deployments = []
    this.lastDeployments = {}
    this.servicesFlat = []
    this.rootDir = ''
    this.pkg = {}
  }
  deployAll (dir) {
    now.setToken(process.env.NOW_TOKEN)

    this.rootDir = dir
    var pkg = Services.getPkg(dir)

    return now.getDeployments()
      .then((deployments) => { this.deployments = deployments })
      .then(this.findLastDeployments.bind(this))
      .then(() => this.addDependencies(this.addService(pkg.name, pkg.version), pkg.services || {}))
      .then(() => {
        var other = this.servicesFlat.find((service) => service.name === pkg.name && service.version !== pkg.version)

        if (other) {
          throw new Error(`Can not depend on a different version of root module: ${other.name}@${other.version}`)
        }
      })
      // deployment of root service should start first
      .then(() => this.deploy(this.servicesFlat.shift()))
      // then all the others in the tree
      .then(() => Promise.all(this.servicesFlat.map(this.deploy.bind(this))))
  }
  discoverAll (pkg, delay) {
    this.pkg = pkg

    if (!this.pkg._now_token || !this.pkg._services) { return Promise.resolve({}) }

    now.setToken(this.pkg._now_token)

    const toDiscover = Object.keys(this.pkg._services)
      .filter(name => this.pkg._services[name].constructor !== String)
      .map(name => Object.assign({name}, this.pkg._services[name]))

    return now.getDeployments()
      .then((deployments) => { this.deployments = deployments })
      .then(() => Promise.all(toDiscover.map(this.discover.bind(this))))
      .then((found) => {
        // Sum the count of successful discoveries
        const discovered = found.reduce((m, v) => m + (v || 0), 0)

        // Check if we discovered all
        if (discovered === toDiscover.length) {
          return this.pkg
        }

        return (new Promise(resolve => setTimeout(resolve, delay)))
          .then(this.discoverAll.bind(this, pkg, delay))
      })
  }
  findLastDeployments () {
    return Promise.all(this.deployments.map(deployment => {
      return now.getPkg(deployment.uid)
        .then(pkg => {
          if (!pkg.version) {
            return
          }

          const module = `${deployment.name}@${pkg.version}`

          if (!this.lastDeployments[module] || this.lastDeployments[module].created < deployment.created) {
            this.lastDeployments[module] = Object.assign({}, deployment)

            // last deployment time of service is saved unaware of version
            // this helps filtering out at discovery time
            if (!this.lastDeployments[deployment.name] || this.lastDeployments[deployment.name] < deployment.created) {
              this.lastDeployments[deployment.name] = deployment.created
            }
          }
        })
    }))
  }
  discover (service) {
    return Promise.all(
      this.deployments
        .filter(deployment => deployment.name === service.name && deployment.created > service.lastDeploy)
        .map(deployment => {
          return now.getPkg(deployment.uid)
            .then(pkg => pkg.version === service.version ? deployment.url : false)
        })
    )
      .then(urls => {
        const url = urls.find(url => url)

        if (url) {
          this.pkg._services[service.name] = url

          // Return 1 to sum count of successful discoveries
          return 1
        }
      })
  }
  addService (name, version) {
    var service = {
      name, version,
      dependants: [], dependencies: [],
      deploy: true, lastDeploy: 0, lastUrl: ''
    }
    this.servicesFlat.push(service)

    const module = `${name}@${version}`

    if (this.lastDeployments[name]) {
      service.lastDeploy = this.lastDeployments[name]

      if (this.lastDeployments[module]) {
        service.lastUrl = this.lastDeployments[module].url
        service.deploy = false
      }
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

        // passing now token in package.json for discovery api calls
        // this needs a better solution
        pkg._now_token = process.env.NOW_TOKEN
        Services.setPkg(dir, pkg)

        return command.run('npm install', dir)
      })
      .then(() => {
        const p = command.run('now', dir)

        if (root) {
          p.then((output) => {
            const url = output.match(/Ready! .*? /)
            console.log(url ? url[0] : '')
          })

          // root deployment returns immediately
          // so deployment of dependencies can run in parallel
          return Promise.resolve()
        }

        return p
      })
      .then(() => root ? Promise.resolve() : command.run(`rm -r ${dir}`))
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
