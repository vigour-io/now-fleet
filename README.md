# now-fleet
<!-- VDOC.badges travis; standard; npm; coveralls -->
<!-- DON'T EDIT THIS SECTION (including comments), INSTEAD RE-RUN `vdoc` TO UPDATE -->
[![Build Status](https://travis-ci.org/vigour-io/now-fleet.svg?branch=master)](https://travis-ci.org/vigour-io/now-fleet)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)
[![npm version](https://badge.fury.io/js/now-fleet.svg)](https://badge.fury.io/js/vigour-observable)
[![Coverage Status](https://coveralls.io/repos/github/vigour-io/now-fleet/badge.svg?branch=master)](https://coveralls.io/github/vigour-io/now-fleet?branch=master)
<!-- VDOC END -->
An api to make it easy to deploy complete infrastructures of microservices using now

#### Usage
```javascript
const fleet = require('now-fleet')

// set api token
const now = new fleet.Now('API-TOKEN')

now.getDeployments()
  .then(list => {
    console.log('returns a list of deployments', list)
  })

now.getPkg('deployment-uid')
  .then(pkg => {
    console.log('gets the package.json', pkg)
  })
```
