import configPromise from '@payload-config'
import { getPayload } from 'payload'

export async function getPayloadClient() {
  return getPayload({ config: configPromise })
}

export async function safePayload<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await operation()
  } catch {
    return fallback
  }
}
