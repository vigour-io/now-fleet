'use strict'

const https = require('https')

module.exports = class Now {
  constructor (token) {
    this.apiToken = token
  }
  getDeployments (cb) {
    return this.apiGet('deployments')
      .then(result => result.deployments)
  }
  getPkg (uid, cb) {
    return this.apiGet(`deployments/${uid}/files`)
      .then(list => {
        var pkgUid = list.find(file => file.name === 'package.json').uid
        return this.apiGet(`deployments/${uid}/files/${pkgUid}`)
      })
  }
  apiGet (path) {
    return new Promise((resolve, reject) => {
      https.request({
        hostname: 'api.zeit.co',
        path: `/now/${path}`,
        port: 443,
        method: 'GET',
        headers: {
          'Authorization': `Bearer: ${this.apiToken}`
        }
      }, res => {
        var data = ''
        res.on('data', d => { data += d })
        res.on('end', () => resolve(JSON.parse(data)))
      })
        .on('error', (error) => reject(error))
        .end()
    })
  }
}
