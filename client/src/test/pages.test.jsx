import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

vi.mock('../components/MapView', () => ({ default: () => <div data-testid="map" />, ZoneLegend: () => null, ServiceLegend: () => null, ZONE_COLORS: {} }))
vi.mock('../hooks/useSocket', () => ({ useSocket: () => {} }))
import App from '../App'

async function signIn(role, email, landing) {
  window.history.pushState({}, '', '/login')
  render(<App />)
  fireEvent.change(screen.getByLabelText('Sign in as'), { target: { value: role } })
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test1234' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
  await screen.findByRole('heading', { level: 1, name: landing }, { timeout: 8000 })
}

// Every sidebar entry per role -> the page heading it must show. A crash would show the error boundary instead.
const PORTALS = [
  ['tourist', 'tourist@test.com', /Welcome, Riddhi/, [['My Journey', 'My Journey'], ['Safety Zones', 'Safety Zones'], ['Emergency / SOS', 'Emergency / SOS'], ['Profile', 'Profile'], ['Dashboard', /Welcome, Riddhi/]]],
  ['company', 'company@test.com', 'Agency Dashboard', [['Tourists', 'Tourists'], ['Verification', 'Verification'], ['Trips', 'Trips'], ['Guides', 'Guides'], ['Alerts', 'Alerts'], ['Dashboard', 'Agency Dashboard']]],
  ['authority', 'authority@test.com', 'Safety Control Dashboard', [['Tourists', 'Tourists'], ['Incidents', 'Incidents'], ['Safety Zones', 'Safety Zones'], ['Response Units', 'Response Units'], ['Analytics', 'Analytics'], ['Dashboard', 'Safety Control Dashboard']]],
  ['responder', 'responder@test.com', 'Rescue Team Alpha', [['Active Incidents', 'Active Incidents'], ['My Unit', 'My Unit'], ['Operations Map', 'Operations Map'], ['Dashboard', 'Rescue Team Alpha']]],
]

describe.each(PORTALS)('%s portal: every page renders', (role, email, landing, pages) => {
  test('all menu pages load without crashing', async () => {
    await signIn(role, email, landing)
    for (const [menu, heading] of pages) {
      fireEvent.click(within(screen.getAllByRole('navigation')[0]).getByText(menu))
      expect(await screen.findByRole('heading', { level: 1, name: heading }, { timeout: 8000 })).toBeInTheDocument()
      expect(screen.queryByText('Something went wrong on this page')).toBeNull()
    }
  })
})

describe('detail pages', () => {
  test('agency trip detail opens from the trips list and shows settings + tourists', async () => {
    await signIn('company', 'company@test.com', 'Agency Dashboard')
    fireEvent.click(within(screen.getAllByRole('navigation')[0]).getByText('Trips'))
    fireEvent.click(await screen.findByText('Maharashtra Explorer', { selector: 'b' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Maharashtra Explorer' })).toBeInTheDocument()
    expect(await screen.findByText('Trip settings')).toBeInTheDocument()
    expect(await screen.findByText(/Tourists on this trip/)).toBeInTheDocument()
  })

  test('authority tourist detail shows the explanation for the risk level', async () => {
    await signIn('authority', 'authority@test.com', 'Safety Control Dashboard')
    fireEvent.click(within(screen.getAllByRole('navigation')[0]).getByText('Tourists'))
    fireEvent.click(await screen.findByText('Riddhi Shah'))
    expect(await screen.findByText('Why this risk level')).toBeInTheDocument()
  })
})
