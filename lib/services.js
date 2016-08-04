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
    now.setToken(process.env.NOW_TOKEN)
  }
  deployAll (dir) {
    var pkg = Services.getPkg(dir)

    return now.getDeployments()
      .then(this.setDeployments.bind(this))
      .then(this.findLastDeployments.bind(this))
      .then(() => this.addDependencies(this.addService(pkg.name, pkg.version), pkg.services || {}))
      .then(() => {
        var other = this.servicesFlat.find((service) => service.name === pkg.name && service.version !== pkg.version)

        if (other) {
          throw new Error(`Can not depend on a different version of root module: ${other.name}@${other.version}`)
        }
      })
      .then(() => {
        return Promise.all(this.servicesFlat.map(service => {
          return this.deploy(service,
            service.name === pkg.name ? dir
              : path.join(dir, 'node_modules', service.name)
          )
        }))
      })
  }
  setDeployments (deployments) {
    this.deployments = deployments
    return Promise.resolve()
  }
  findLastDeployments () {
    return Promise.all(this.deployments.map(deployment => {
      return now.getPkg(deployment.uid)
        .then(pkg => {
          const module = `${deployment.name}@${pkg.version}`

          if (!this.lastDeployments[module] || this.lastDeployments[module].created < deployment.created) {
            this.lastDeployments[module] = Object.assign({}, deployment)

            if (!this.lastDeployments[deployment.name] || this.lastDeployments[deployment.name] < deployment.created) {
              this.lastDeployments[deployment.name] = deployment.created
            }
          }
        })
    }))
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
            return Services.wireDependency(dependant, dependency)
          }

          dependency = this.addService(name, latest)

          Services.wireDependency(dependant, dependency)

          return npm.getServices(`${name}@${latest}`)
            .then(services => this.addDependencies(dependency, services))
        })
    }))
  }
  deploy (service, dir) {
    var _services = {}
    service.dependencies.forEach(dependency => {
      _services[dependency.name] = {
        version: dependency.version,
        url: dependency.deploy ? dependency.lastDeploy : dependency.lastUrl
      }
    })
    var pkg = Services.getPkg(dir)
    pkg._services = _services
    Services.setPkg(dir, pkg)

    return command.run('npm install', dir)
      .then(() => command.run('now', dir))
      .then(() => command.run(`rm -r ${dir}`))
  }
  static wireDependency (dependant, dependency) {
    dependency.dependants.push(dependant)
    dependant.dependencies.push(dependency)
    if (dependency.deploy) {
      Services.deployDependant(dependant)
    }
  }
  static deployDependant (dependant) {
    if (dependant.deploy) { return }
    dependant.deploy = true
    dependant.dependants.forEach(Services.deployDependant)
  }
  static getPkg (dir) {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json')))
  }
  static setPkg (dir, pkg) {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg))
  }
}