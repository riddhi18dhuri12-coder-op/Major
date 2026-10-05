import { Component } from 'react'

/** Keeps one broken page from blanking the whole app. */
export default class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { console.error('Page crashed:', error) }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
        <h2 className="text-lg font-semibold text-red-300">Something went wrong on this page</h2>
        <p className="mt-2 text-sm text-slate-400">The rest of the app is fine. Try another page or reload.</p>
        <button onClick={() => window.location.reload()} className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-cyan-500">Reload</button>
      </div>
    )
  }
}
