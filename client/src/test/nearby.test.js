import { describe, test, expect } from 'vitest'
import { parseOverpass, withDistance, distanceM } from '../lib/nearby'
import { markNearest } from '../components/NearbyHelp'

const json = { elements: [
  { type: 'node', id: 1, lat: 28.62, lon: 77.21, tags: { amenity: 'hospital', name: 'City Hospital' } },
  { type: 'way', id: 2, center: { lat: 28.611, lon: 77.201 }, tags: { amenity: 'police', name: 'Connaught Place Police Station' } },
  { type: 'node', id: 3, lat: 28.6101, lon: 77.2001, tags: { amenity: 'police' } },
  { type: 'node', id: 1, lat: 28.62, lon: 77.21, tags: { amenity: 'hospital', name: 'City Hospital' } }, // duplicate
  { type: 'node', id: 4, lat: 28.6, lon: 77.2, tags: { amenity: 'cafe' } },
  { type: 'node', id: 5, tags: { amenity: 'hospital' } }, // no position
] }

describe('nearby hospitals and police stations', () => {
  test('parses Overpass output: kinds, centres of areas, no duplicates, no unrelated places', () => {
    const items = parseOverpass(json)
    expect(items.map((i) => i.id)).toEqual(['node/1', 'way/2', 'node/3'])
    expect(items.map((i) => i.kind)).toEqual(['hospital', 'police', 'police'])
    expect(items[1].latitude).toBe(28.611)
    expect(items[2].name).toBeNull()
  })
  test('sorts nearest first and highlights the nearest of each kind', () => {
    const here = { latitude: 28.61, longitude: 77.2 }
    const sorted = withDistance(parseOverpass(json), here)
    expect(sorted[0].id).toBe('node/3')
    expect(distanceM(here, here)).toBe(0)
    const marked = markNearest(sorted)
    expect(marked.filter((s) => s.nearest).map((s) => s.id).sort()).toEqual(['node/1', 'node/3'])
  })
})
