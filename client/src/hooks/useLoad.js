import { useCallback, useEffect, useState } from 'react'

/** Load data on mount and on demand: const { data, error, loading, reload } = useLoad(() => api.get('/x'), [deps]) */
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const run = useCallback(async () => {
    try {
      const data = await fn()
      setState({ data, error: null, loading: false })
    } catch (e) {
      setState((s) => ({ ...s, error: e.message, loading: false }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { run() }, [run])
  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) }
}
