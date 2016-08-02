'use strict'

const command = require('./command')

exports.getLastVersion = module => {
  return command.run(`npm v ${module} version`)
    .then(output => {
      return output
        .split('\n').pop() // last line
        .split(' ').shift() // before space
        .split('@').pop() // after @
    })
}

exports.getServices = module => {
  return command.run(`npm v ${module} services`).then(output => {
    return JSON.parse(output === 'undefined' ? '{}' : output)
  })
}
