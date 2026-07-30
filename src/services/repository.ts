import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { demoTracks } from '../data/demoTracks'
import type { GeneratedTrack, InspirationTrack } from '../types'

interface JamCaptureDB extends DBSchema {
  inspirations: { key: string; value: InspirationTrack }
  generated: { key: string; value: GeneratedTrack }
  audioBlobs: { key: string; value: Blob }
  settings: { key: string; value: { key: string; value: boolean } }
}

let database: Promise<IDBPDatabase<JamCaptureDB>> | null = null

function getDatabase() {
  if (!database) {
    database = openDB<JamCaptureDB>('jamcapture', 1, {
      upgrade(db) {
        db.createObjectStore('inspirations', { keyPath: 'id' })
        db.createObjectStore('generated', { keyPath: 'id' })
        db.createObjectStore('audioBlobs')
        db.createObjectStore('settings', { keyPath: 'key' })
      },
    })
  }
  return database
}

export function isLegacySimulatedGeneration(track: GeneratedTrack) {
  return track.audioSource.type === 'asset' && /^\/(?:2|3)\.mp3$/.test(track.audioSource.url)
}

export const repository = {
  async initialize() {
    const db = await getDatabase()

    const cleanedLegacyGenerated = await db.get('settings', 'legacy-generated-cleaned-v1')
    if (!cleanedLegacyGenerated?.value) {
      const legacyTracks = (await db.getAll('generated')).filter(isLegacySimulatedGeneration)
      const tx = db.transaction(['generated', 'settings'], 'readwrite')
      await Promise.all([
        ...legacyTracks.map((track) => tx.objectStore('generated').delete(track.id)),
        tx.objectStore('settings').put({ key: 'legacy-generated-cleaned-v1', value: true }),
      ])
      await tx.done
    }

    const seeded = await db.get('settings', 'demo-seeded')
    if (seeded?.value) return

    // Seed tracks and marker share one transaction so a reload cannot duplicate samples.
    const tx = db.transaction(['inspirations', 'settings'], 'readwrite')
    await Promise.all([
      ...demoTracks.map((track) => tx.objectStore('inspirations').put(track)),
      tx.objectStore('settings').put({ key: 'demo-seeded', value: true }),
      tx.done,
    ])
  },

  async getInspirations() {
    return (await (await getDatabase()).getAll('inspirations')).sort(
      (a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt),
    )
  },

  async getInspiration(id: string) {
    return (await getDatabase()).get('inspirations', id)
  },

  async saveInspiration(track: InspirationTrack, blob?: Blob) {
    const db = await getDatabase()
    const stores = blob ? ['inspirations', 'audioBlobs'] as const : ['inspirations'] as const
    const tx = db.transaction(stores, 'readwrite')
    await tx.objectStore('inspirations').put(track)
    if (blob && track.audioSource.type === 'blob') {
      await tx.objectStore('audioBlobs').put(blob, track.audioSource.blobId)
    }
    await tx.done
  },

  async deleteInspiration(track: InspirationTrack) {
    const db = await getDatabase()
    const stores = track.audioSource.type === 'blob' ? ['inspirations', 'audioBlobs'] as const : ['inspirations'] as const
    const tx = db.transaction(stores, 'readwrite')
    await tx.objectStore('inspirations').delete(track.id)
    if (track.audioSource.type === 'blob') await tx.objectStore('audioBlobs').delete(track.audioSource.blobId)
    await tx.done
  },

  async getGenerated() {
    return (await (await getDatabase()).getAll('generated')).sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )
  },

  async saveGenerated(track: GeneratedTrack, blob?: Blob) {
    const db = await getDatabase()
    const stores = blob ? ['generated', 'audioBlobs'] as const : ['generated'] as const
    const tx = db.transaction(stores, 'readwrite')
    await tx.objectStore('generated').put(track)
    if (blob && track.audioSource.type === 'blob') await tx.objectStore('audioBlobs').put(blob, track.audioSource.blobId)
    await tx.done
  },

  async deleteGenerated(track: GeneratedTrack) {
    const db = await getDatabase()
    const stores = track.audioSource.type === 'blob' ? ['generated', 'audioBlobs'] as const : ['generated'] as const
    const tx = db.transaction(stores, 'readwrite')
    await tx.objectStore('generated').delete(track.id)
    if (track.audioSource.type === 'blob') await tx.objectStore('audioBlobs').delete(track.audioSource.blobId)
    await tx.done
  },

  async getAudioBlob(id: string) {
    return (await getDatabase()).get('audioBlobs', id)
  },
}
