import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { ToastProvider } from './components/ui'
import Guard from './components/Guard'

import Home from './pages/Home/Home'
import Login from './pages/Auth/Login'

import { TouristProvider } from './pages/Tourist/TouristContext'
const TouristDashboard = lazy(() => import('./pages/Tourist/TouristDashboard'))
const Journey = lazy(() => import('./pages/Tourist/Journey'))
const SafetyZones = lazy(() => import('./pages/Tourist/SafetyZones'))
const Emergency = lazy(() => import('./pages/Tourist/Emergency'))
const Profile = lazy(() => import('./pages/Tourist/Profile'))

const AgencyDashboard = lazy(() => import('./pages/Agency/AgencyDashboard'))
const AgencyTourists = lazy(() => import('./pages/Agency/Tourists'))
const Verification = lazy(() => import('./pages/Agency/Verification'))
const TripList = lazy(() => import('./pages/Agency/Trips').then((m) => ({ default: m.TripList })))
const TripDetail = lazy(() => import('./pages/Agency/Trips').then((m) => ({ default: m.TripDetail })))
const Guides = lazy(() => import('./pages/Agency/Guides'))
const Alerts = lazy(() => import('./pages/Agency/Alerts'))

const AuthorityDashboard = lazy(() => import('./pages/Authority/AuthorityDashboard'))
const AuthorityTourists = lazy(() => import('./pages/Authority/Tourists'))
const Incidents = lazy(() => import('./pages/Authority/Incidents'))
const Zones = lazy(() => import('./pages/Authority/Zones'))
const Units = lazy(() => import('./pages/Authority/Units'))
const Analytics = lazy(() => import('./pages/Authority/Analytics'))

import { ResponderProvider } from './pages/Emergency/ResponderContext'
const EmergencyDashboard = lazy(() => import('./pages/Emergency/EmergencyDashboard'))
const ActiveIncidents = lazy(() => import('./pages/Emergency/ActiveIncidents'))
const MyUnit = lazy(() => import('./pages/Emergency/MyUnit'))
const OperationsMap = lazy(() => import('./pages/Emergency/OperationsMap'))

const tourist = (el) => <Guard roles={['tourist']} portal="tourist"><TouristProvider>{el}</TouristProvider></Guard>
const agency = (el, roles = ['company', 'guide']) => <Guard roles={roles} portal="agency">{el}</Guard>
const authority = (el) => <Guard roles={['authority']} portal="authority">{el}</Guard>
const emergency = (el) => <Guard roles={['responder']} portal="emergency"><ResponderProvider>{el}</ResponderProvider></Guard>

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<p className="py-20 text-center text-sm text-slate-500">Loading…</p>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />

            <Route path="/tourist" element={tourist(<TouristDashboard />)} />
            <Route path="/tourist/journey" element={tourist(<Journey />)} />
            <Route path="/tourist/safety" element={tourist(<SafetyZones />)} />
            <Route path="/tourist/emergency" element={tourist(<Emergency />)} />
            <Route path="/tourist/profile" element={tourist(<Profile />)} />

            <Route path="/agency" element={agency(<AgencyDashboard />)} />
            <Route path="/agency/tourists" element={agency(<AgencyTourists />)} />
            <Route path="/agency/verification" element={agency(<Verification />, ['company'])} />
            <Route path="/agency/trips" element={agency(<TripList />)} />
            <Route path="/agency/trips/:id" element={agency(<TripDetail />)} />
            <Route path="/agency/guides" element={agency(<Guides />, ['company'])} />
            <Route path="/agency/alerts" element={agency(<Alerts />)} />

            <Route path="/authority" element={authority(<AuthorityDashboard />)} />
            <Route path="/authority/tourists" element={authority(<AuthorityTourists />)} />
            <Route path="/authority/incidents" element={authority(<Incidents />)} />
            <Route path="/authority/zones" element={authority(<Zones />)} />
            <Route path="/authority/units" element={authority(<Units />)} />
            <Route path="/authority/analytics" element={authority(<Analytics />)} />

            <Route path="/emergency" element={emergency(<EmergencyDashboard />)} />
            <Route path="/emergency/incidents" element={emergency(<ActiveIncidents />)} />
            <Route path="/emergency/units" element={emergency(<MyUnit />)} />
            <Route path="/emergency/map" element={emergency(<OperationsMap />)} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
