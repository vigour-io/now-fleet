'use strict'

const https = require('https')

var apiToken

exports.setToken = token => { apiToken = token }

exports.getDeployments = () => apiGet('deployments').then(result => result.deployments)

exports.getPkg = uid => {
  return apiGet(`deployments/${uid}/files`)
    .then(list => {
      var pkgUid = list.find(file => file.name === 'package.json').uid
      return apiGet(`deployments/${uid}/files/${pkgUid}`)
    })
}

function apiGet (path) {
  return new Promise((resolve, reject) => {
    https.request({
      hostname: 'api.zeit.co',
      path: `/now/${path}`,
      port: 443,
      method: 'GET',
      headers: {
        'Authorization': `Bearer: ${apiToken}`
      }
    }, res => {
      var data = ''
      res.on('data', d => { data += d })
      res.on('end', () => {
        try {
          data = JSON.parse(data)
        } catch (e) {
          data = {}
        }

        resolve(data)
      })
    })
      .on('error', (error) => reject(error))
      .end()
  })
}
