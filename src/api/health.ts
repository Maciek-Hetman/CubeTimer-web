import { apiRequest } from './client'
import type { HealthResponse } from './types'

export function getHealthLive(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health/live')
}

export function getHealthReady(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health/ready')
}

export const getLive = getHealthLive
export const getReady = getHealthReady
