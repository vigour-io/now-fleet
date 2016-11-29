#!/usr/bin/env node

'use strict'

const fleet = require('../lib/fleet')
const dir = process.cwd()

fleet.getServices(fleet.getPkg(dir), dir, process.argv[2])
  .then(() => {
    console.info('Deployment successful. Services will discover each other soon.')
  })
  .catch((error) => {
    console.error('Deployment failed due to error: %j, stack: %s', error, error ? error.stack : '(no stack)')
  })
