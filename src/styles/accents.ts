export interface AccentPalette {
  id: string
  label: string
  light: { main: string; soft: string }
  dark: { main: string; soft: string }
}

export const ACCENT_PRESETS: AccentPalette[] = [
  {
    id: 'blue',
    label: 'Blue',
    light: { main: '#1d4ed8', soft: '#dbe7ff' },
    dark: { main: '#5b8cff', soft: '#1a2744' },
  },
  {
    id: 'green',
    label: 'Green',
    light: { main: '#0f766e', soft: '#d8f5f0' },
    dark: { main: '#2dd4bf', soft: '#123833' },
  },
  {
    id: 'purple',
    label: 'Purple',
    light: { main: '#7e22ce', soft: '#f3e8ff' },
    dark: { main: '#c084fc', soft: '#3b2856' },
  },
  {
    id: 'orange',
    label: 'Orange',
    light: { main: '#c2410c', soft: '#ffedd5' },
    dark: { main: '#fb923c', soft: '#4a2810' },
  },
  {
    id: 'rose',
    label: 'Rose',
    light: { main: '#be123c', soft: '#ffe4e6' },
    dark: { main: '#fb7185', soft: '#4c1d24' },
  },
  {
    id: 'yellow',
    label: 'Yellow',
    light: { main: '#d97706', soft: '#fef3c7' },
    dark: { main: '#fbbf24', soft: '#451a03' },
  },
  {
    id: 'cyan',
    label: 'Cyan',
    light: { main: '#0891b2', soft: '#cffafe' },
    dark: { main: '#22d3ee', soft: '#164e63' },
  },
  {
    id: 'pink',
    label: 'Pink',
    light: { main: '#c026d3', soft: '#fae8ff' },
    dark: { main: '#e879f9', soft: '#4a044e' },
  },
  {
    id: 'mint',
    label: 'Mint',
    light: { main: '#059669', soft: '#d1fae5' },
    dark: { main: '#34d399', soft: '#064e3b' },
  },
  {
    id: 'indigo',
    label: 'Indigo',
    light: { main: '#4f46e5', soft: '#e0e7ff' },
    dark: { main: '#818cf8', soft: '#312e81' },
  },
]

export function getAccentPalette(id: string): AccentPalette {
  return ACCENT_PRESETS.find((p) => p.id === id) || ACCENT_PRESETS[0]
}
