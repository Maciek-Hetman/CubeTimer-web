export type AccentTier = 'vivid' | 'standard' | 'muted'

export interface AccentPalette {
  id: string
  label: string
  tier: AccentTier
  light: { main: string; soft: string }
  dark: { main: string; soft: string }
}

export const ACCENT_TIERS: { id: AccentTier; label: string }[] = [
  { id: 'vivid', label: 'Vivid' },
  { id: 'standard', label: 'Standard' },
  { id: 'muted', label: 'Muted' },
]

export const ACCENT_PRESETS: AccentPalette[] = [
  {
    id: 'blue-vivid',
    label: 'Blue',
    tier: 'vivid',
    light: { main: '#3b82f6', soft: '#dbeafe' },
    dark: { main: '#93c5fd', soft: '#172554' },
  },
  {
    id: 'green-vivid',
    label: 'Green',
    tier: 'vivid',
    light: { main: '#059669', soft: '#d1fae5' },
    dark: { main: '#34d399', soft: '#064e3b' },
  },
  {
    id: 'purple-vivid',
    label: 'Purple',
    tier: 'vivid',
    light: { main: '#8b5cf6', soft: '#ede9fe' },
    dark: { main: '#a78bfa', soft: '#2e1065' },
  },
  {
    id: 'orange-vivid',
    label: 'Orange',
    tier: 'vivid',
    light: { main: '#ea580c', soft: '#ffedd5' },
    dark: { main: '#fb923c', soft: '#431407' },
  },
  {
    id: 'rose-vivid',
    label: 'Rose',
    tier: 'vivid',
    light: { main: '#e11d48', soft: '#ffe4e6' },
    dark: { main: '#fb7185', soft: '#4c0519' },
  },
  {
    id: 'yellow-vivid',
    label: 'Yellow',
    tier: 'vivid',
    light: { main: '#d97706', soft: '#fef3c7' },
    dark: { main: '#fbbf24', soft: '#451a03' },
  },
  {
    id: 'cyan-vivid',
    label: 'Cyan',
    tier: 'vivid',
    light: { main: '#0891b2', soft: '#cffafe' },
    dark: { main: '#67e8f9', soft: '#164e63' },
  },
  {
    id: 'indigo-vivid',
    label: 'Indigo',
    tier: 'vivid',
    light: { main: '#6366f1', soft: '#e0e7ff' },
    dark: { main: '#a5b4fc', soft: '#312e81' },
  },
  {
    id: 'blue',
    label: 'Blue',
    tier: 'standard',
    light: { main: '#1d4ed8', soft: '#dbe7ff' },
    dark: { main: '#5b8cff', soft: '#1a2744' },
  },
  {
    id: 'green',
    label: 'Green',
    tier: 'standard',
    light: { main: '#0f766e', soft: '#d8f5f0' },
    dark: { main: '#2dd4bf', soft: '#123833' },
  },
  {
    id: 'purple',
    label: 'Purple',
    tier: 'standard',
    light: { main: '#7e22ce', soft: '#f3e8ff' },
    dark: { main: '#c084fc', soft: '#3b2856' },
  },
  {
    id: 'orange',
    label: 'Orange',
    tier: 'standard',
    light: { main: '#c2410c', soft: '#ffedd5' },
    dark: { main: '#fb923c', soft: '#4a2810' },
  },
  {
    id: 'rose',
    label: 'Rose',
    tier: 'standard',
    light: { main: '#be123c', soft: '#ffe4e6' },
    dark: { main: '#fb7185', soft: '#4c1d24' },
  },
  {
    id: 'yellow',
    label: 'Yellow',
    tier: 'standard',
    light: { main: '#b45309', soft: '#fce8c8' },
    dark: { main: '#f59e0b', soft: '#3f2a06' },
  },
  {
    id: 'cyan',
    label: 'Cyan',
    tier: 'standard',
    light: { main: '#0e7490', soft: '#cfeef7' },
    dark: { main: '#22d3ee', soft: '#164e63' },
  },
  {
    id: 'indigo',
    label: 'Indigo',
    tier: 'standard',
    light: { main: '#4f46e5', soft: '#e0e7ff' },
    dark: { main: '#818cf8', soft: '#312e81' },
  },
  {
    id: 'blue-muted',
    label: 'Blue',
    tier: 'muted',
    light: { main: '#1e3a8a', soft: '#dce5f0' },
    dark: { main: '#3f63c4', soft: '#1a2338' },
  },
  {
    id: 'green-muted',
    label: 'Green',
    tier: 'muted',
    light: { main: '#065f46', soft: '#d1e9df' },
    dark: { main: '#1f8a7e', soft: '#102c29' },
  },
  {
    id: 'purple-muted',
    label: 'Purple',
    tier: 'muted',
    light: { main: '#581c87', soft: '#eadcf5' },
    dark: { main: '#8256c8', soft: '#2a2040' },
  },
  {
    id: 'orange-muted',
    label: 'Orange',
    tier: 'muted',
    light: { main: '#9a3412', soft: '#f7e2cf' },
    dark: { main: '#c96a2c', soft: '#3d2414' },
  },
  {
    id: 'rose-muted',
    label: 'Rose',
    tier: 'muted',
    light: { main: '#881337', soft: '#f6dfe3' },
    dark: { main: '#c25068', soft: '#3d1a24' },
  },
  {
    id: 'yellow-muted',
    label: 'Yellow',
    tier: 'muted',
    light: { main: '#92400e', soft: '#f3e0c2' },
    dark: { main: '#cf7a1f', soft: '#33210a' },
  },
  {
    id: 'cyan-muted',
    label: 'Cyan',
    tier: 'muted',
    light: { main: '#155e75', soft: '#cfe4ea' },
    dark: { main: '#1796b2', soft: '#122e38' },
  },
  {
    id: 'indigo-muted',
    label: 'Indigo',
    tier: 'muted',
    light: { main: '#3730a3', soft: '#dfe0f3' },
    dark: { main: '#5f6bc4', soft: '#1c1f3a' },
  },
]

export function getAccentPalette(id: string): AccentPalette {
  return ACCENT_PRESETS.find((p) => p.id === id) || ACCENT_PRESETS[0]
}
