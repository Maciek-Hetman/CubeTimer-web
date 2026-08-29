export interface AccentColor {
  id: string
  label: string
  light: string
  dark: string
  ao5: { light: string; dark: string }
  ao12: { light: string; dark: string }
}

export const ACCENT_COLORS: AccentColor[] = [
  {
    id: 'blue',
    label: 'Blue',
    light: '#1d4ed8',
    dark: '#5b8cff',
    ao5: { light: '#16a34a', dark: '#4ade80' },
    ao12: { light: '#d97706', dark: '#fbbf24' },
  },
  {
    id: 'green',
    label: 'Green',
    light: '#0f766e',
    dark: '#2dd4bf',
    ao5: { light: '#7c3aed', dark: '#a78bfa' },
    ao12: { light: '#d97706', dark: '#fbbf24' },
  },
  {
    id: 'purple',
    label: 'Purple',
    light: '#7e22ce',
    dark: '#c084fc',
    ao5: { light: '#16a34a', dark: '#4ade80' },
    ao12: { light: '#d97706', dark: '#fbbf24' },
  },
  {
    id: 'orange',
    label: 'Orange',
    light: '#c2410c',
    dark: '#fb923c',
    ao5: { light: '#16a34a', dark: '#4ade80' },
    ao12: { light: '#2563eb', dark: '#60a5fa' },
  },
  {
    id: 'rose',
    label: 'Rose',
    light: '#be123c',
    dark: '#fb7185',
    ao5: { light: '#16a34a', dark: '#4ade80' },
    ao12: { light: '#0284c7', dark: '#38bdf8' },
  },
  {
    id: 'yellow',
    label: 'Yellow',
    light: '#b45309',
    dark: '#f59e0b',
    ao5: { light: '#16a34a', dark: '#4ade80' },
    ao12: { light: '#4f46e5', dark: '#818cf8' },
  },
  {
    id: 'cyan',
    label: 'Cyan',
    light: '#0e7490',
    dark: '#22d3ee',
    ao5: { light: '#e11d48', dark: '#fb7185' },
    ao12: { light: '#d97706', dark: '#fbbf24' },
  },
  {
    id: 'indigo',
    label: 'Indigo',
    light: '#4f46e5',
    dark: '#818cf8',
    ao5: { light: '#16a34a', dark: '#4ade80' },
    ao12: { light: '#d97706', dark: '#fbbf24' },
  },
]

export function getAccentColor(id: string): AccentColor {
  return ACCENT_COLORS.find((color) => color.id === id) || ACCENT_COLORS[0]
}
