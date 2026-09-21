/**
 * Map the stand hostname → an IP when split-DNS is unavailable on the runner.
 * Set both env vars, otherwise this shim is a no-op and normal DNS applies.
 * Usage: APP_FF_HOST=app.example APP_FF_IP=203.0.113.10 \
 *        NODE_OPTIONS='--require ./support/dns-app-ff.cjs' ./run-hybrid.sh …
 */
const dns = require('node:dns')
const APP_FF_HOST = process.env.APP_FF_HOST || ''
const APP_FF_IP = process.env.APP_FF_IP || ''

const origLookup = dns.lookup

function patchedLookup(hostname, options, callback) {
    if (typeof options === 'function') {
        callback = options
        options = {}
    } else if (typeof options === 'number') {
        options = { family: options }
    } else if (!options) {
        options = {}
    }

    if (APP_FF_IP && APP_FF_HOST && hostname === APP_FF_HOST) {
        const family = options.family === 6 ? 6 : 4
        const address = APP_FF_IP
        if (typeof callback === 'function') {
            if (options.all) {
                callback(null, [{ address, family }])
            } else {
                callback(null, address, family)
            }
            return
        }
    }

    return origLookup.call(this, hostname, options, callback)
}

if (APP_FF_IP && APP_FF_HOST) dns.lookup = patchedLookup

if (APP_FF_IP && APP_FF_HOST && dns.promises?.lookup) {
    const origPromisesLookup = dns.promises.lookup.bind(dns.promises)
    dns.promises.lookup = async (hostname, options) => {
        if (hostname === APP_FF_HOST) {
            const family = options?.family === 6 ? 6 : 4
            if (options?.all) return [{ address: APP_FF_IP, family }]
            return { address: APP_FF_IP, family }
        }
        return origPromisesLookup(hostname, options)
    }
}
