import { io } from 'socket.io-client'
import { ORIGIN, freshToken } from './api'

// The access token lives 15 minutes, and the server checks it on every (re)connect,
// so the token is looked up - and refreshed if needed - before each connection attempt.
export function connectSocket() {
  return io(ORIGIN || undefined, {
    transports: ['websocket', 'polling'],
    auth: async (cb) => cb({ token: await freshToken() }),
  })
}
