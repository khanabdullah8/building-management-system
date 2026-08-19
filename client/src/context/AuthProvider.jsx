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

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setUser(null)
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
