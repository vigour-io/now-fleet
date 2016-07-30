'use strict'
const https = require('https')
var apiToken

exports.setToken = (token) => {
  apiToken = token
}

exports.getDeployments = (cb) => get('deployments', (result) => cb(result.deployments))

exports.getPkg = (uid, cb) => {
  get(`deployments/${uid}/files`, (list) => {
    // only use lets when they are nessecary (this is the top of a block var yields same result)
    var pkgUid = list.find((file) => file.name === 'package.json').uid
    get(`deployments/${uid}/files/${pkgUid}`, cb)
  })
}

function get (path, cb) {
  https.request({
    hostname: 'api.zeit.co',
    path: `/now/${path}`,
    port: 443,
    method: 'GET',
    headers: {
      'Authorization': `Bearer: ${apiToken}`
    }
  }, (res) => {
    // only use lets when they are nessecary (this is the top of a block var yields same result)
    var data = ''
    res.on('data', (d) => { data += d })
    res.on('end', () => { cb(JSON.parse(data)) })
  }).end()
}
