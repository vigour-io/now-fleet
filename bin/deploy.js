#!/usr/bin/env node

'use strict'

const Services = require('../lib/services')
const services = new Services()

services.deployAll(process.cwd())
  .then(() => {
    console.info('Deployment successful. Services will discover each other soon.')
  })
  .catch((error) => {
    console.error('Deployment failed due to error: %j, stack: %s', error, error ? error.stack : '(no stack)')
  })
