# now-fleet
<!-- VDOC.badges travis; standard; npm; coveralls -->
<!-- DON'T EDIT THIS SECTION (including comments), INSTEAD RE-RUN `vdoc` TO UPDATE -->
[![Build Status](https://travis-ci.org/vigour-io/now-fleet.svg?branch=master)](https://travis-ci.org/vigour-io/now-fleet)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)
[![npm version](https://badge.fury.io/js/now-fleet.svg)](https://badge.fury.io/js/now-fleet)
[![Coverage Status](https://coveralls.io/repos/github/vigour-io/now-fleet/badge.svg?branch=master)](https://coveralls.io/github/vigour-io/now-fleet?branch=master)
<!-- VDOC END -->

An api to make it easy to deploy complete infrastructures of microservices using now

## Installing

```bash
npm install now-fleet --save
```

## Service Dependency
We define service dependencies in `package.json` of each service. Let's say we have a service A depending on service B and C, `package.json` for A should have a `services` field as following:
```json
{
  "services": {
    "serviceB": "^2.0.0",
    "serviceC": "^3.0.0"
  }
}
```

Let's say B also depends on C. Then `package.json` for B should have a `services` field as following:
```json
{
  "services": {
    "serviceC": "^2.0.0"
  }
}
```

Service dependencies need a version like npm module dependencies. This version should be a **published version of npm module** for dependency service. For our example, service A depends on `^3.0.0` of C but service B depends on `^2.0.0` of C.

## Fleet Deployment
We start deployment from the topmost service which depends on other services, for our example service A. Let's call it **root service**.

```bash
export NOW_TOKEN="YOUR-NOW-API-TOKEN"
export REGISTRY_HOST="registery.host.sh"
node_modules/.bin/now-fleet-deploy type=ENV_TYPE
```

This script walks through all the services we depend on and dependencies of them recursively. Deploys them to now and gives us now url of root service.

### Root Service Decision
Deployment script should run on a service considering dependency tree. It can only walk down from top and can't discover dependants magically. If there is a service in the stack which is not a dependency of any other service, it won't be discovered and should be deployed separately.

### Circular Dependency
Circular dependencies are taken care at deployment time and all fine. A can depend on B and B can depend on A at the same time or while A depends on B and B depends on C; C can depend on A.

### Limitations
Another version of root service can't be a dependency of any service in the tree. For example `serviceA@2.0.0` is deployment root and depends on, service B and service C. This schema allows service B or C depending on `serviceA@2.0.0` but not on `serviceA@1.0.0`.

## Service Discovery
Each service should discover dependency urls on the boot time. This module provides a method for discovery.

### discoverAll(pkg, delay)
Discovers host names of dependencies defined in `package.json` by polling the latest deployed services from now API. Takes care of finding the host name for the right version of the dependency service.
Second parameter is the delay in miliseconds between each polling from now API. It'll repeat until discovering all the deployments. 

```js
const services = require('now-fleet').services

const pkg = require('./package.json')

services.discoverAll(pkg, 2000)
  .then(pkg => {
    // pkg._services object has all the host names
    // pkg._services.serviceC is something like url-sdfsd.now.sh
  })
```
