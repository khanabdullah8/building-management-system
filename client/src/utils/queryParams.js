export function buildListParams({ page = 1, limit = 20, search = '', filters = {} }) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('limit', String(limit))

  if (search && search.trim()) {
    params.set('search', search.trim())
  }

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value)
    }
  })

  return params.toString()
}
