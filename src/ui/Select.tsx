import type { CSSProperties, ReactNode, SelectHTMLAttributes } from 'react'
import './Select.css'

interface SelectOption {
  value: string
  label: ReactNode
  disabled?: boolean
}

interface SelectProps {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  options: SelectOption[]
  disabled?: boolean
  'aria-label'?: string
  style?: CSSProperties
  className?: string
  placeholder?: string
  variant?: 'default' | 'ghost'
  size?: 'default' | 'small'
}

export function Select({
  value,
  defaultValue,
  onChange,
  options,
  disabled,
  'aria-label': ariaLabel,
  style,
  className = '',
  placeholder,
  variant = 'default',
  size = 'default',
}: SelectProps) {
  const selectProps: SelectHTMLAttributes<HTMLSelectElement> =
    value === undefined ? { defaultValue } : { value }

  return (
    <div className={['custom-select-container', variant, size, className].filter(Boolean).join(' ')} style={style}>
      <select
        {...selectProps}
        className="custom-select-trigger"
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <svg
        className="custom-select-icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  )
}
