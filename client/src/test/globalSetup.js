// Starts the real API (with seeded demo data) for the end-to-end UI tests.
import { spawn, execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const server = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../server')
const PORT = '4011'
const env = {
  ...process.env, NODE_ENV: 'test', PORT, SCHEDULER_ENABLED: 'false',
  MONGODB_URI: `${process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017'}/sts_ui_${Date.now()}`,
  JWT_ACCESS_SECRET: 'ui-test-access-secret-ui-test-access-secret-1',
  JWT_REFRESH_SECRET: 'ui-test-refresh-secret-ui-test-refresh-secret-2',
  CORS_ORIGINS: 'http://localhost:3000',
}
let child

export async function setup() {
  execFileSync('node', ['src/seed.js', '--reset'], { cwd: server, env, stdio: 'ignore' })
  child = spawn('node', ['src/server.js'], { cwd: server, env, stdio: 'ignore' })
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/ready`)).ok) break } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  process.env.VITE_API_ORIGIN = `http://127.0.0.1:${PORT}`
  process.env.UI_TEST_PORT = PORT
}
export async function teardown() { child?.kill('SIGTERM') }
