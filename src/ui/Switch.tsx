import type { InputHTMLAttributes, ReactNode } from 'react'

export function Switch({
  label,
  description,
  checked,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> & {
  label: ReactNode
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        {...props}
      />
      <span className="switch-copy">
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  )
}
