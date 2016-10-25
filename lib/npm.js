'use strict'

const command = require('./command')

exports.getLastVersion = module => {
  return command.run(`npm v ${module} version`)
    .then(output => {
      return output
        .split('\n').pop() // last line
        .split(' ').pop() // after space
        .replace(/'/g, '') // without quotes
    })
}

exports.getServices = module => {
  return command.run(`npm v ${module} services`).then(output => {
    output = output.replace(/'/g, '"')
    return JSON.parse(output.indexOf('{') === -1 ? '{}' : output)
  })
}
