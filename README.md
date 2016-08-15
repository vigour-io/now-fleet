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
We define service dependencies in package.json for each service. Let's say we have a service A depending on service B and C.

package.json for A should have a `services` field as following:
```json
{
  "services": {
    "serviceB": "^2.0.0",
    "serviceC": "^3.0.0"
  }
}
```

Let's say B also depends on C. Then package.json for B should have a `services` fields as following:
```json
{
  "services": {
    "serviceC": "^2.0.0"
  }
}
```

Service dependencies need a version like npm module dependencies. This version is the published npm module version of dependency service. For our example, service A depends on `^3.0.0` of C but service B depends on `^2.0.0` of C.

## Fleet Deployment
We start deployment from the topmost service which depends on other services. It is service A for our example.

```bash
node_modules/.bin/now-fleet-deploy
```

This script walks through all the services we depend on and dependencies of them recursively. Deploys them to now and gives us now url of root service (A).

## Service Discovery
Each service should discover dependency urls on the boot time. This module provides a method for discovery.

### discoverAll(pkg, delay)
Discovers host names of dependencies defined in package.json by polling the latest deployed services from now API. Takes care of finding the host name for the right version of the dependency service.
Second parameter is the delay in miliseconds between each polling from now API. It'll repeat until finding the deployments. 

```js
const Services = require('now-fleet').Services
const services = new Services()

const pkg = require('./package.json')

services.discoverAll(pkg, 2000)
  .then(pkg => {
    // pkg._services object has all the host names
    // pkg._services.serviceC is something like url-sdfsd.now.sh
  })
```
