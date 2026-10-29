import { describe, test, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '../App'

afterEach(() => { document.documentElement.style.fontSize = ''; document.documentElement.lang = 'en'; delete document.documentElement.dataset.theme; localStorage.removeItem('sts.theme') })

const open = (path) => { window.history.pushState({}, '', path); return render(<App />) }

describe('language and text size controls', () => {
  test('the login page can be switched to Hindi, and the choice is remembered', async () => {
    open('/login')
    expect(await screen.findByText('Welcome Back')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'hi' } })
    expect(await screen.findByText('वापसी पर स्वागत है')).toBeTruthy()
    expect(localStorage.getItem('sts.lang')).toBe('hi')
    expect(document.documentElement.lang).toBe('hi')
    expect(screen.getByRole('button', { name: 'साइन इन करें' })).toBeTruthy()
  })

  test('a saved language is applied on the next visit', async () => {
    localStorage.setItem('sts.lang', 'ta')
    open('/login')
    await waitFor(() => expect(screen.getByRole('button', { name: 'உள்நுழை' })).toBeTruthy())
  })

  test('text size goes up and down in steps, can be reset, and is remembered', async () => {
    open('/login')
    await screen.findByText('Welcome Back')
    expect(document.documentElement.style.fontSize).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Make text larger' }))
    expect(document.documentElement.style.fontSize).toBe('115%')
    expect(localStorage.getItem('sts.textSize')).toBe('115')
    fireEvent.click(screen.getByRole('button', { name: 'Make text smaller' }))
    fireEvent.click(screen.getByRole('button', { name: 'Make text smaller' }))
    expect(document.documentElement.style.fontSize).toBe('85%')
    expect(screen.getByRole('button', { name: 'Make text smaller' }).disabled).toBe(true) // cannot go below the minimum
    fireEvent.click(screen.getByRole('button', { name: 'Reset text size to normal' }))
    expect(document.documentElement.style.fontSize).toBe('')
  })

  test('the home page also has both controls', async () => {
    open('/')
    expect(await screen.findByLabelText('Language')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Make text larger' })).toBeTruthy()
  })

  test('the theme switches between dark and light and is remembered', async () => {
    open('/login')
    await screen.findByText('Welcome Back')
    expect(document.documentElement.dataset.theme).toBe('dark')
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('sts.theme')).toBe('light')
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  test('a saved light theme is applied on the next visit', async () => {
    localStorage.setItem('sts.theme', 'light')
    open('/login')
    await screen.findByText('Welcome Back')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
