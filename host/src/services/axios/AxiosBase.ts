import axios from 'axios'
import AxiosResponseIntrceptorErrorCallback from './AxiosResponseIntrceptorErrorCallback'
import AxiosRequestIntrceptorConfigCallback from './AxiosRequestIntrceptorConfigCallback'
import appConfig from '@/configs/app.config'
import type { AxiosError } from 'axios'

function isMongoLong(
    v: unknown,
): v is { low: number; high: number; unsigned: boolean } {
    if (!v || typeof v !== 'object') return false
    const r = v as Record<string, unknown>
    return (
        typeof r.low === 'number' &&
        typeof r.high === 'number' &&
        typeof r.unsigned === 'boolean'
    )
}

function convertMongoLongs(value: unknown): unknown {
    if (value === null || value === undefined || typeof value !== 'object')
        return value
    if (isMongoLong(value)) {
        const lo = value.low >>> 0
        if (value.high === 0) return lo
        const n = value.high * 0x1_0000_0000 + lo
        return Number.isSafeInteger(n) ? n : String(n)
    }
    if (Array.isArray(value)) return value.map(convertMongoLongs)
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value))
        out[k] = convertMongoLongs((value as Record<string, unknown>)[k])
    return out
}

const AxiosBase = axios.create({
    timeout: 60000,
    baseURL: appConfig.apiPrefix,
    withCredentials: appConfig.accessTokenPersistStrategy === 'cookies',
})

AxiosBase.interceptors.request.use(
    (config) => {
        return AxiosRequestIntrceptorConfigCallback(config)
    },
    (error) => {
        return Promise.reject(error)
    },
)

AxiosBase.interceptors.response.use(
    (response) => {
        response.data = convertMongoLongs(response.data)
        return response
    },
    (error: AxiosError) => {
        AxiosResponseIntrceptorErrorCallback(error)
        return Promise.reject(error)
    },
)

export default AxiosBase
