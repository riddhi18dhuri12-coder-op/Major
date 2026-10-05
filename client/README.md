# Client (React + Vite)

See the project README one level up. Quick start:

```
npm install
npm run dev      # http://localhost:5173  (proxies /api and /socket.io to localhost:4000)
npm run build    # production build in dist/
npm test         # end-to-end UI tests (starts the API itself; needs TEST_MONGODB_URI)
```
Set `VITE_API_ORIGIN` (see `.env.example`) when the API is hosted on another domain.
