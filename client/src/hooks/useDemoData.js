import { useCallback, useEffect, useState } from 'react'

// Phase 2 helper: simulates a network request so pages can exercise
// loading / error / empty states before backend endpoints exist.
// Replace with real API calls in later phases.
export function useDemoData(loader, delay = 300) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      try {
        const data = loader()
        if (!cancelled) {
          setState({ loading: false, error: null, data })
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: error.message || 'Failed to load demo data.',
            data: null,
          })
        }
      }
    }, delay)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [attempt, loader, delay])

  const retry = useCallback(() => {
    setState({ loading: true, error: null, data: null })
    setAttempt((current) => current + 1)
  }, [])

  return { ...state, retry }
}
