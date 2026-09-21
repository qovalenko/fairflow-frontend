/**
 * DNS shim for the hybrid runner, loaded via `node --require`.
 *
 * Stand hostnames may live in an internal resolver. On a machine that reaches
 * the stand over a VPN but has no split-DNS for it (and no sudo for /etc/hosts), the
 * host dev server's proxy dies on `getaddrinfo ENOTFOUND the stand` and the shell
 * renders "Манифест микрофронтендов недоступен" instead of the app — every
 * qa-id spec then fails for a reason that has nothing to do with the product.
 *
 * Activated only when FF_DNS_MAP is set:
 *   FF_DNS_MAP="the stand=203.0.113.10" node --require support/dns-shim.cjs …
 * The URL keeps the original hostname, so TLS SNI and the `Host` header still
 * match the stand certificate.
 */
const dns = require('dns')

const MAP = Object.fromEntries(
    (process.env.FF_DNS_MAP || '')
        .split(',')
        .map((pair) => pair.trim())
        .filter(Boolean)
        .map((pair) => {
            const idx = pair.indexOf('=')
            return [pair.slice(0, idx).trim(), pair.slice(idx + 1).trim()]
        })
        .filter(([host, ip]) => host && ip),
)

if (Object.keys(MAP).length > 0) {
    const originalLookup = dns.lookup
    dns.lookup = function patchedLookup(hostname, options, callback) {
        const ip = MAP[hostname]
        if (!ip) return originalLookup.call(dns, hostname, options, callback)
        if (typeof options === 'function') {
            callback = options
            options = {}
        }
        const entry = { address: ip, family: 4 }
        process.nextTick(() => callback(null, options && options.all ? [entry] : ip, 4))
    }

    if (dns.promises) {
        const originalPromiseLookup = dns.promises.lookup
        dns.promises.lookup = async function patchedPromiseLookup(hostname, options) {
            const ip = MAP[hostname]
            if (!ip) return originalPromiseLookup.call(dns.promises, hostname, options)
            const entry = { address: ip, family: 4 }
            return options && options.all ? [entry] : entry
        }
    }
}
