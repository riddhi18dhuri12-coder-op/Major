// Tiny outbox so an SOS or check-in pressed with no signal is not lost: it is saved on the device
// and sent automatically when the connection returns (the "offline / PWA" requirement).
const KEY = 'sts.outbox'
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] } }
const write = (items) => localStorage.setItem(KEY, JSON.stringify(items))

export const outbox = {
  add(item) { write([...read(), { ...item, queued_at: new Date().toISOString() }]) },
  all: read,
  count: () => read().length,
  /** Try to send everything; keeps items that still fail because of the network. */
  async flush(send) {
    const keep = []
    let sent = 0
    for (const item of read()) {
      try { await send(item); sent++ } catch (e) { if (e.status === 0) keep.push(item) /* still offline */ }
    }
    write(keep)
    return sent
  },
}
