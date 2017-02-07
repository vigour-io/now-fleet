'use strict'

exports.command = require('./command')
exports.npm = require('./npm')
exports.fleet = require('./fleet')

// Hack to silence brisky-hub issue

process.on('uncaughtException', error => {
  if (error.message.indexOf('Error: cannot call send() while not connected') < 0) {
    throw error
  }
})
