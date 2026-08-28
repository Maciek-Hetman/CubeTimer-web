import { createId } from '../domain/models'
import { getMeta, setMeta } from '../data/db'

const DEVICE_ID_KEY = 'device.id'
const CURRENT_OWNER_KEY = 'owner.current'
const GUEST_OWNER_KEY = 'owner.guest'
const AUTH_REFRESH_KEY = 'auth.refresh'
const AUTH_USER_KEY = 'auth.user'
const DEVICE_NAME_KEY = 'device.name'

export async function getDeviceId(): Promise<string> {
  const existing = await getMeta<string | null>(DEVICE_ID_KEY, null)
  if (existing) {
    return existing
  }
  const id = createId()
  await setMeta(DEVICE_ID_KEY, id)
  return id
}

export async function getStoredDeviceId(): Promise<string | null> {
  return getMeta<string | null>(DEVICE_ID_KEY, null)
}

export async function getDeviceName(): Promise<string> {
  const existing = await getMeta<string | null>(DEVICE_NAME_KEY, null)
  if (existing) {
    return existing
  }
  const name = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : 'CubeTimer Web'
  await setMeta(DEVICE_NAME_KEY, name)
  return name
}

export async function getStoredDeviceName(): Promise<string | null> {
  return getMeta<string | null>(DEVICE_NAME_KEY, null)
}

export async function ensureGuestOwner(): Promise<string> {
  const current = await getMeta<string | null>(CURRENT_OWNER_KEY, null)
  if (current?.startsWith('guest:')) {
    await setMeta(GUEST_OWNER_KEY, current)
    return current
  }
  let guest = await getMeta<string | null>(GUEST_OWNER_KEY, null)
  if (!guest) {
    guest = `guest:${createId()}`
    await setMeta(GUEST_OWNER_KEY, guest)
  }
  if (!current) {
    await setMeta(CURRENT_OWNER_KEY, guest)
  }
  return guest
}

export async function getCurrentOwnerId(): Promise<string> {
  const current = await getMeta<string | null>(CURRENT_OWNER_KEY, null)
  if (current) {
    return current
  }
  return ensureGuestOwner()
}

export async function setCurrentOwnerId(ownerId: string): Promise<void> {
  await setMeta(CURRENT_OWNER_KEY, ownerId)
  if (ownerId.startsWith('guest:')) {
    await setMeta(GUEST_OWNER_KEY, ownerId)
  }
}

export async function createFreshGuestOwner(): Promise<string> {
  const guest = `guest:${createId()}`
  await setMeta(GUEST_OWNER_KEY, guest)
  await setMeta(CURRENT_OWNER_KEY, guest)
  return guest
}

export function isGuestOwner(ownerId: string): boolean {
  return ownerId.startsWith('guest:')
}

export async function saveAuth(refreshToken: string, user: unknown): Promise<void> {
  await setMeta(AUTH_REFRESH_KEY, refreshToken)
  await setMeta(AUTH_USER_KEY, user)
}

export async function clearAuth(): Promise<void> {
  await setMeta(AUTH_REFRESH_KEY, null)
  await setMeta(AUTH_USER_KEY, null)
}

export async function getStoredRefreshToken(): Promise<string | null> {
  return getMeta<string | null>(AUTH_REFRESH_KEY, null)
}

export async function getStoredUser<T>(): Promise<T | null> {
  return getMeta<T | null>(AUTH_USER_KEY, null)
}
