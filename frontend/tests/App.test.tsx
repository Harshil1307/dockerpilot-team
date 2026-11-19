import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../src/App'

describe('DockerPilot overview', () => {
  it('shows infrastructure and the current container list', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Good morning, Jordan' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Containers' })).toBeInTheDocument()
    expect(screen.getByText('postgres-main')).toBeInTheDocument()
    expect(screen.getByText('System health')).toBeInTheDocument()
  })

  it('filters containers by name', () => {
    render(<App />)
    fireEvent.change(screen.getByPlaceholderText('Filter containers...'), { target: { value: 'redis' } })
    expect(screen.getByText('redis-cache')).toBeInTheDocument()
    expect(screen.queryByText('postgres-main')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 1 of 4 containers')).toBeInTheDocument()
  })

  it('toggles a container status and updates the running count', () => {
    render(<App />)
    const row = screen.getByText('worker-queue').closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Start worker-queue' }))
    expect(within(row).getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('4', { selector: '.metric-value' })).toBeInTheDocument()
  })
})
