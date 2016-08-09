#!/usr/bin/env node

'use strict'

const Services = require('../lib/services')
const services = new Services()

services.discoverAll(process.cwd(), 2000)
  .then(() => {
    console.info('All services discovered.')
  })
  .catch((error) => {
    console.error('Service discovery failed due to error : %j, stack: %s', error, error ? error.stack : '(no stack)')
  })
