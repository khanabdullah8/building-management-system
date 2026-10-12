import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './auth-context'
import http from '../api/http'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(() => !localStorage.getItem('token'))
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('token')))

  useEffect(() => {
    if (authChecked) return

    let cancelled = false
    http
      .get('/v1/auth/me')
      .then((res) => {
        if (!cancelled) setUser(res.data?.data?.user ?? null)
      })
      .catch(() => {
        localStorage.removeItem('token')
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          setAuthChecked(true)
        }
      })

    return () => { cancelled = true }
  }, [authChecked])

  const login = useCallback(async (email, password) => {
    const res = await http.post('/v1/auth/login', { email, password })
    const { token, user: loggedIn } = res.data.data
    localStorage.setItem('token', token)
    setUser(loggedIn)
    return loggedIn
  }, [])

  const logout = useCallback(async () => {
    const token = localStorage.getItem('token')

    // Clear local credentials first so a slow or failed request can never
    // leave the user in an authenticated state.
    localStorage.removeItem('token')
    setUser(null)

    if (!token) return

    try {
      // Pass the token explicitly: localStorage is already cleared, so the
      // request interceptor would not attach the Authorization header. The
      // token is never logged.
      await http.post('/v1/auth/logout', null, {
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {
      // Ignore network/server failures. The local session is already cleared,
      // so the user is signed out regardless of the server response.
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      logout,
    }),
    [user, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
