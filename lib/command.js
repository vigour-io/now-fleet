'use strict'

const cp = require('child_process')
const maxBuffer = 100 * 1024

exports.run = (command, cwd) => {
  return new Promise((resolve, reject) => {
    cp.exec(command, {maxBuffer, cwd}, (error, stdout) => {
      if (error) { return reject(error) }

      resolve(stdout.toString().trim())
    })
  })
}
