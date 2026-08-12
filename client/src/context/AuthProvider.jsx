import { useMemo, useState } from 'react'
import { AuthContext } from './auth-context'

// Phase 2 stub: establishes the auth architecture. JWT-backed
// authentication and role-based access will be wired in a later phase.
export function AuthProvider({ children }) {
  const [user] = useState(null)

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      login: async () => {
        throw new Error('Authentication is not implemented yet (Phase 2).')
      },
      logout: async () => {},
    }),
    [user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
