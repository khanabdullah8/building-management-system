import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'

vi.mock('axios', () => {
  const mockAxios = {
    create: vi.fn(() => {
      const instance = {
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      }
      return instance
    }),
  }
  return { default: mockAxios }
})

describe('http.js', () => {
  let requestInterceptor
  let responseInterceptor

  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  it('creates axios instance with /api baseURL', async () => {
    await import('../api/http')
    expect(axios.create).toHaveBeenCalledWith({
      baseURL: '/api',
      timeout: 15000,
    })
  })

  it('registers request and response interceptors', async () => {
    await import('../api/http')
    const instance = axios.create.mock.results[0].value
    expect(instance.interceptors.request.use).toHaveBeenCalled()
    expect(instance.interceptors.response.use).toHaveBeenCalled()
  })

  it('request interceptor attaches Authorization header from localStorage', async () => {
    localStorage.setItem('token', 'my-token')
    await import('../api/http')
    const instance = axios.create.mock.results[0].value
    requestInterceptor = instance.interceptors.request.use.mock.calls[0][0]

    const config = { headers: {} }
    const result = requestInterceptor(config)

    expect(result.headers.Authorization).toBe('Bearer my-token')
  })

  it('request interceptor does not attach header without token', async () => {
    await import('../api/http')
    const instance = axios.create.mock.results[0].value
    requestInterceptor = instance.interceptors.request.use.mock.calls[0][0]

    const config = { headers: {} }
    const result = requestInterceptor(config)

    expect(result.headers.Authorization).toBeUndefined()
  })

  it('response error interceptor returns success responses unchanged', async () => {
    await import('../api/http')
    const instance = axios.create.mock.results[0].value
    responseInterceptor = instance.interceptors.response.use.mock.calls[0][0]

    const response = { data: 'ok' }
    const result = responseInterceptor(response)

    expect(result).toBe(response)
  })

  it('response error interceptor extracts message from error', async () => {
    await import('../api/http')
    const instance = axios.create.mock.results[0].value
    const errorHandler = instance.interceptors.response.use.mock.calls[0][1]

    const error = { response: { status: 500, data: { message: 'Server error' } } }
    try {
      await errorHandler(error)
      expect.fail('should have thrown')
    } catch (err) {
      expect(err.message).toBe('Server error')
    }
  })

  it('response error interceptor falls back to error.message', async () => {
    await import('../api/http')
    const instance = axios.create.mock.results[0].value
    const errorHandler = instance.interceptors.response.use.mock.calls[0][1]

    const error = { message: 'Network error' }
    try {
      await errorHandler(error)
      expect.fail('should have thrown')
    } catch (err) {
      expect(err.message).toBe('Network error')
    }
  })
})
