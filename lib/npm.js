'use strict'

const exec = require('child_process').exec
const maxBuffer = 500 * 1024

exports.getLastVersion = (module, cb) => {
  getOutput(`npm v ${module} version`, (output) => {
    cb(
      output
        .split('\n').pop() // last one
        .split(' ').shift() // before space
        .split('@').pop() // after @
    )
  })
}

exports.getServices = (module, cb) => {
  getOutput(`npm v ${module} services`, (output) => {
    cb(JSON.parse(output === 'undefined' ? '{}' : output))
  })
}

function getOutput (command, cb) {
  var cmd = exec(command, {maxBuffer})
  var output = ''
  cmd.stdout.on('data', (o) => {output += o.toString()})
  cmd.on('close', () => {cb(output.trim())})
}
