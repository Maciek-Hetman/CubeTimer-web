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
]

export function getAccentPalette(id: string): AccentPalette {
  return ACCENT_PRESETS.find((p) => p.id === id) || ACCENT_PRESETS[0]
}
