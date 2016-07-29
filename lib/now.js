'use strict'

const https = require('https')

var api_token

exports.set_token = (token) => {
  api_token = token
}

exports.get_pkg = (uid, cb) => {
  get(`deployments/${uid}/files`, (list) => {
    let pkg_uid = list.find((file) => file.name == 'package.json').uid
    get(`deployments/${uid}/files/${pkg_uid}`, cb)
  })
}

exports.get_deployments = (cb) => get('deployments', (result) => cb(result.deployments))

function get (path, cb) {
  https.request({
    hostname: 'api.zeit.co',
    path: `/now/${path}`,
    port: 443,
    method: 'GET',
    headers: {
      'Authorization': `Bearer: ${api_token}`
    }
  }, (res) => {
    let data = ''

    res.on('data', (d) => {
      data += d
    })

    res.on('end', () => {
      cb(JSON.parse(data))
    })
  }).end()
}
