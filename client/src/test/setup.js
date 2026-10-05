import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => { cleanup(); localStorage.clear() })

// jsdom has no geolocation / confirm; stub what the app touches
Object.defineProperty(globalThis.navigator, 'geolocation', { value: { watchPosition: () => 1, clearWatch: () => {} }, configurable: true })
globalThis.confirm = () => true
