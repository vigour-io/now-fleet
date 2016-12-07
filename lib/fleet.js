'use strict'

const path = require('path')
const fs = require('fs')

const now = require('observe-now')
const Hub = require('brisky-hub')

const npm = require('./npm')
const command = require('./command')

const hubId = +new Date()

const getList = () => new Promise((resolve, reject) => {
  const registry = new Hub({
    id: hubId,
    url: `wss://${process.env.REGISTRY_HOST}`,
    context: false
  })

  const prepare = () => {
    const deployments = registry.get('deployments')

    var list = []

    deployments.each(dep => {
      if (!dep.get([ 'pkg', 'version' ])) {
        return
      }

      const deployment = {
        name: dep.name.compute(),
        version: dep.pkg.version.compute(),
        env: dep.pkg.env.compute(),
        url: dep.url.compute(),
        created: dep.created.compute()
      }

      const found = list.find(
        d => d.name === deployment.name && d.version === deployment.version && d.env === deployment.env
      )

      if (found && found.created < deployment.created) {
        found.url = deployment.url
        found.created = deployment.created
      } else if (!found) {
        list.push(deployment)
      }
    })

    list.sort((a, b) => {
      return a.created > b.created ? -1 : b.created > a.created ? 1 : 0
    })

    resolve(list)

    registry.set(null)
  }

  var timeout = setTimeout(() => {
    clearTimeout(timeout)
    reject(new Error('Failed to connect to registry hub and retrieve deployments.'))
    registry.set(null)
  }, 15e3)

  registry.subscribe({ deployments: { val: true } }, (val) => {
    clearTimeout(timeout)
    timeout = setTimeout(prepare, 500)
    registry.off('subscription', 'deps')
  }, null, null, null, 'deps')
})

var data = exports.data = {}

function resetData () {
  data.deployments = []
  data.servicesFlat = []
  data.dir = ''
  data.env = ''
}

exports.getServices = (pkg, dir, env) => {
  resetData()

  var rootService

  if (pkg._services) {
    // is this already deployed? then we are discovering
    const delay = dir && Number(dir) > 0 ? Number(dir) : 3e3

    return getList()
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
            .then(() => exports.getServices(pkg, dir))
        }

        return pkg
      })
  } else {
    // if not deployed yet then we are deploying
    data.dir = dir || process.cwd()
    data.env = env || process.env.envSet || ''

    return getList()
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
      .then(() => preparePkg(rootService, Object.assign({}, pkg)))
  }
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
    console.log(`NowFleet: skipped deploying ${found.name}@${found.version} for ${found.env} ${found.url}`)
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
  const dir = path.join(data.dir, 'node_modules', service.name)

  exports.setPkg(dir, preparePkg(service, exports.getPkg(dir)))

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

function preparePkg (service, pkg) {
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
  pkg._services = _services
  pkg._env = data.env
  delete pkg.devDependencies
  return pkg
}

exports.getPkg = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json')))
exports.setPkg = (dir, pkg) => fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
