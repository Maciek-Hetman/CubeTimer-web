import { useState, useRef, useEffect } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import './Select.css'

export interface SelectOption {
  value: string
  label: ReactNode
  disabled?: boolean
}

export interface SelectProps {
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
  size = 'default'
}: SelectProps) {
  const [internalValue, setInternalValue] = useState(value !== undefined ? value : defaultValue)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value)
    }
  }, [value])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOption = options.find(opt => opt.value === internalValue)
  
  const displayLabel = selectedOption 
    ? selectedOption.label 
    : (placeholder || (options.length > 0 && !placeholder ? options[0].label : 'Select...'))

  const handleSelect = (event: React.MouseEvent, option: SelectOption) => {
    event.preventDefault()
    event.stopPropagation()
    if (option.disabled) return
    if (value === undefined) setInternalValue(option.value)
    setIsOpen(false)
    onChange?.(option.value)
  }

  return (
    <div 
      className={`custom-select-container ${variant} ${size} ${disabled ? 'disabled' : ''} ${className}`} 
      style={style} 
      ref={containerRef}
    >
      <button
        type="button"
        className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!disabled) setIsOpen(!isOpen)
        }}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="custom-select-label">
          {displayLabel}
        </span>
        <svg 
          className="custom-select-icon" 
          width="16" height="16" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      <div className={`custom-select-menu ${isOpen ? 'open' : ''}`} role="listbox">
        {options.map((opt) => (
          <button
            type="button"
            key={opt.value}
            role="option"
            aria-selected={opt.value === internalValue}
            className={`custom-select-option ${opt.value === internalValue ? 'selected' : ''} ${opt.disabled ? 'disabled' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={(e) => handleSelect(e, opt)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
