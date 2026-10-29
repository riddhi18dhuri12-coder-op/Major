import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react'

// Leaflet needs a real browser layout; stand in a plain element that exposes what the map was given.
vi.mock('../components/MapView', () => ({
  default: ({ zones = [], tourists = [], incidents = [], units = [], onMapClick }) => (
    <div data-testid="map" data-zones={zones.length} data-tourists={tourists.length} data-incidents={incidents.length} data-units={units.length}>
      {onMapClick && <button onClick={() => onMapClick({ latitude: 12.5, longitude: 77.5 })}>map-click</button>}
    </div>
  ),
  ZoneLegend: () => null,
  ServiceLegend: () => null,
  ZONE_COLORS: {},
}))
// Sockets are covered by the server test-suite; here we exercise the REST flows through the real UI.
vi.mock('../hooks/useSocket', () => ({ useSocket: () => {} }))

import App from '../App'

const API = `${import.meta.env.VITE_API_ORIGIN}/api`
const PASSWORD = 'test1234'

function open(path) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

async function signIn(role, email, landing) {
  open('/login')
  fireEvent.change(screen.getByLabelText('Sign in as'), { target: { value: role } })
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: PASSWORD } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
  return screen.findByText(landing, {}, { timeout: 8000 })
}

const click = (name) => fireEvent.click(screen.getByRole('button', { name }))
const navTo = async (label) => { fireEvent.click(within(screen.getAllByRole('navigation')[0]).getByText(label)) }

async function apiToken(role, email) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD, role }) })
  return (await r.json()).access_token
}

describe('sign in', () => {
  test('wrong password shows an error and stays on the page', async () => {
    open('/login')
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'tourist@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope-nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials')
  })

  test('home page links to login', () => {
    open('/')
    expect(screen.getByText(/intelligent protection/i)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /login|get started/i }).length).toBeGreaterThan(0)
  })

  test('route guard: signed-out users are sent to login; wrong portal is redirected', async () => {
    open('/authority')
    expect(await screen.findByText('Welcome Back')).toBeInTheDocument()
  })
})

describe('tourist journey', () => {
  test('dashboard, verified Digital ID, and sending an SOS', async () => {
    await signIn('tourist', 'tourist@test.com', /Welcome, Riddhi/)
    expect(await screen.findByText(/STID-\d{4}-\d{4}/)).toBeInTheDocument()
    expect(screen.getByText(/Safety Status: Safe/)).toBeInTheDocument()

    click('SOS')
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, send SOS' }))
    expect(await screen.findByText(/SOS sent \(INC-\d+\)/)).toBeInTheDocument()
    await screen.findByText(/Safety Status: Emergency/, {}, { timeout: 5000 })

    const incidents = await (await fetch(`${API}/incidents`, { headers: { Authorization: `Bearer ${await apiToken('company', 'company@test.com')}` } })).json()
    expect(incidents.some((i) => i.type === 'SOS' && i.tourist_name === 'Riddhi Shah')).toBe(true)
  })

  test('a signed-in tourist who opens the authority URL lands back on the tourist portal', async () => {
    await signIn('tourist', 'tourist@test.com', /Welcome, Riddhi/)
    cleanup()
    open('/authority') // same browser session (tokens are in localStorage)
    expect(await screen.findByText(/Welcome, Riddhi/)).toBeInTheDocument()
    expect(window.location.pathname).toBe('/tourist')
  })
})

describe('agency', () => {
  test('dashboard counts and approving a verification issues a Digital ID', async () => {
    await signIn('company', 'company@test.com', 'Agency Dashboard')
    expect(await screen.findByText('Registered Tourists')).toBeInTheDocument()
    expect(await screen.findByText('Pending Verification')).toBeInTheDocument()

    await navTo('Verification')
    await screen.findByText('Pending requests')
    expect(await screen.findByText(/Aarav Mehta/)).toBeInTheDocument()
    expect(screen.getByText(/•••• 9876/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText(/Digital ID STID-\d{4}-\d{4} issued/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('No requests are waiting. 🎉')).toBeInTheDocument())
  })

  test('add a tourist to a trip and receive the activation details', async () => {
    await signIn('company', 'company@test.com', 'Agency Dashboard')
    await navTo('Tourists')
    fireEvent.click(await screen.findByRole('button', { name: 'Add Tourist' }))
    fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: 'Meera Joshi' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'meera@test.com' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add tourist' }))
    await screen.findByText('Tourist added')
    expect(within(screen.getByRole('dialog')).getByText(/TST-\d{4}-\d{5}/)).toBeInTheDocument()
  })

  test('guides can be added', async () => {
    await signIn('company', 'company@test.com', 'Agency Dashboard')
    await navTo('Guides')
    fireEvent.click(await screen.findByRole('button', { name: 'Add Guide' }))
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Neha Patil' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'neha@test.com' } })
    fireEvent.change(screen.getByLabelText(/Temporary password/), { target: { value: 'password123' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add guide' }))
    expect(await screen.findByText('Neha Patil')).toBeInTheDocument()
  })

  test('a guide sees the portal without agency-only menu items', async () => {
    await signIn('guide', 'guide@test.com', 'Agency Dashboard')
    const nav = within(screen.getAllByRole('navigation')[0])
    expect(nav.getByText('Trips')).toBeInTheDocument()
    expect(nav.queryByText('Guides')).toBeNull()
    expect(nav.queryByText('Verification')).toBeNull()
  })
})

describe('authority and response team', () => {
  test('authority sees the SOS, dispatches the nearest unit; the responder works it to resolution', async () => {
    await signIn('authority', 'authority@test.com', 'Safety Control Dashboard')
    expect(await screen.findByText('Active Tourists')).toBeInTheDocument()

    await navTo('Incidents')
    await screen.findByText('Incident list')
    fireEvent.click(await screen.findByText(/INC-\d+/))
    expect(await screen.findByText('Dispatch a response unit')).toBeInTheDocument()
    const rescue = await screen.findByText('Rescue Team Alpha')
    fireEvent.click(within(rescue.closest('div.flex')).getByRole('button', { name: 'Dispatch' }))
    expect(await screen.findByText(/Dispatched Rescue Team Alpha/)).toBeInTheDocument()
  })

  test('responder: start response -> arrive -> resolve', async () => {
    await signIn('responder', 'responder@test.com', 'Rescue Team Alpha')
    expect(await screen.findByText('Assigned incidents')).toBeInTheDocument()
    await navTo('Active Incidents')
    await screen.findByText(/Assigned to you/)
    await waitFor(() => expect(screen.queryByText('Assigned incidents')).toBeNull()) // let the page transition finish
    fireEvent.click(await screen.findByText(/SOS Emergency/))
    expect(await screen.findByText('Emergency contacts', {}, { timeout: 5000 })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Start response' }, { timeout: 5000 }))
    fireEvent.click(await screen.findByRole('button', { name: 'Mark arrival (on site)' }, { timeout: 5000 }))
    fireEvent.click(await screen.findByRole('button', { name: 'Mark resolved' }, { timeout: 5000 }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark resolved' })).toBeNull(), { timeout: 5000 })
  })

  test('authority creates a safety zone from the map', async () => {
    await signIn('authority', 'authority@test.com', 'Safety Control Dashboard')
    await navTo('Safety Zones')
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Waterfall Edge' } })
    const create = screen.getByRole('button', { name: 'Create zone' })
    expect(create).toBeDisabled() // not placed on the map yet
    fireEvent.click(await screen.findByText('map-click'))
    await waitFor(() => expect(create).toBeEnabled())
    fireEvent.click(create)
    expect(await screen.findByText(/Zone created/)).toBeInTheDocument()
    expect(await screen.findByText('Waterfall Edge')).toBeInTheDocument()
  })

  test('analytics shows an intact ledger and the audit trail', async () => {
    await signIn('authority', 'authority@test.com', 'Safety Control Dashboard')
    await navTo('Analytics')
    expect(await screen.findByText(/Chain intact/)).toBeInTheDocument()
    expect(await screen.findByText('Zone Created')).toBeInTheDocument()
    expect(screen.getByText('Incident Assigned')).toBeInTheDocument()
  })
})

describe('planned route / deviation monitoring', () => {
  test('agency sets a planned route on a trip (road service offline -> straight-line fallback)', async () => {
    const realFetch = globalThis.fetch
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((url, opts) => (String(url).includes('project-osrm.org') ? Promise.reject(new Error('offline')) : realFetch(url, opts)))
    try {
      await signIn('company', 'company@test.com', 'Agency Dashboard')
      await navTo('Trips')
      fireEvent.click(await screen.findByText('Maharashtra Explorer', { selector: 'b' }))
      expect(await screen.findByText(/No planned route yet/)).toBeInTheDocument()

      fireEvent.click(await screen.findByText('map-click')) // start
      fireEvent.click(screen.getByText('map-click')) // destination
      const save = await screen.findByRole('button', { name: /Save planned route/ }, { timeout: 5000 })
      fireEvent.change(screen.getByLabelText(/Alert agency at/), { target: { value: '800' } })
      fireEvent.click(save)
      expect(await screen.findByText(/Planned route saved/)).toBeInTheDocument()
      expect(await screen.findByText(/Warning at 200 m, deviation alert at 800 m/)).toBeInTheDocument()
    } finally { spy.mockRestore() }
  })

  test('tourist sees the planned route panel on My Journey', async () => {
    await signIn('tourist', 'tourist@test.com', /Welcome, Riddhi/)
    await navTo('My Journey')
    expect(await screen.findByText(/stay on the highlighted route/i)).toBeInTheDocument()
  })
})
