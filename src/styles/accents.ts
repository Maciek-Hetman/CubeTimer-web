export interface AccentColor {
  id: string
  label: string
  light: string
  dark: string
}

export const ACCENT_COLORS: AccentColor[] = [
  { id: 'blue', label: 'Blue', light: '#1d4ed8', dark: '#5b8cff' },
  { id: 'green', label: 'Green', light: '#0f766e', dark: '#2dd4bf' },
  { id: 'purple', label: 'Purple', light: '#7e22ce', dark: '#c084fc' },
  { id: 'orange', label: 'Orange', light: '#c2410c', dark: '#fb923c' },
  { id: 'rose', label: 'Rose', light: '#be123c', dark: '#fb7185' },
  { id: 'yellow', label: 'Yellow', light: '#b45309', dark: '#f59e0b' },
  { id: 'cyan', label: 'Cyan', light: '#0e7490', dark: '#22d3ee' },
  { id: 'indigo', label: 'Indigo', light: '#4f46e5', dark: '#818cf8' },
]

export function getAccentColor(id: string): AccentColor {
  return ACCENT_COLORS.find((color) => color.id === id) || ACCENT_COLORS[0]
}
