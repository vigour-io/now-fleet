'use strict'

const cp = require('child_process')
const maxBuffer = 100 * 1024

module.exports = class Npm {
  getLastVersion (module) {
    return this.runCommand(`npm v ${module} version`)
      .then(output => {
        return output
          .split('\n').pop() // last line
          .split(' ').shift() // before space
          .split('@').pop() // after @
      })
  }
  getServices (module) {
    return this.runCommand(`npm v ${module} services`).then(output => {
      return JSON.parse(output === 'undefined' ? '{}' : output)
    })
  }
  runCommand (command) {
    return new Promise((resolve, reject) => {
      cp.exec(command, {maxBuffer}, (error, stdout) => {
        if (error) { return reject(error) }

        resolve(stdout.toString().trim())
      })
    })
  }
}
