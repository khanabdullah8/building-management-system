import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  )
}

describe('App shell', () => {
  it('renders the layout with the dashboard at /', () => {
    renderApp()

    expect(screen.getByText('Dashboard Module')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Buildings' })).toBeInTheDocument()
  })

  it('navigates to the buildings placeholder page', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('link', { name: 'Buildings' }))

    expect(await screen.findByText('Buildings Module')).toBeInTheDocument()
  })

  it('renders the login page at /login', () => {
    renderApp('/login')

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('renders a 404 page for unknown routes', () => {
    renderApp('/does-not-exist')

    expect(screen.getByText('404')).toBeInTheDocument()
  })
})
