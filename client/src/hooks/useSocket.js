import { useEffect, useRef } from 'react'
import { connectSocket } from '../lib/socket'

/**
 * Subscribe to realtime events for the lifetime of a component.
 * handlers: { 'event:name': (payload) => void }. Handlers may change every render; the latest are always used.
 */
export function useSocket(handlers) {
  const ref = useRef(handlers)
  ref.current = handlers
  useEffect(() => {
    const socket = connectSocket()
    Object.keys(ref.current).forEach((evt) => socket.on(evt, (p) => ref.current[evt]?.(p)))
    return () => socket.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
