'use strict'

const https = require('https')

var registryHost

exports.setHost = host => { registryHost = host }

exports.getList = name => apiGet(name || '')

function apiGet (path) {
  return new Promise((resolve, reject) => {
    https.request({
      hostname: registryHost,
      path: `/${path}`,
      port: 443,
      method: 'GET'
    }, res => {
      var data = ''
      res.on('data', d => { data += d })
      res.on('end', () => {
        try {
          data = JSON.parse(data)
        } catch (e) {
          data = []
        }

        resolve(data)
      })
    })
      .on('error', (error) => reject(error))
      .end()
  })
}
