'use client'

import { useState } from 'react'

// Base styles shared across all inputs
const baseInputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '12px',
  color: 'var(--text-primary)',
  fontSize: '15px',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s ease',
}

const focusedInputStyle: React.CSSProperties = {
  ...baseInputStyle,
  borderColor: 'var(--accent)',
}

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

export const fieldStyle: React.CSSProperties = {
  marginBottom: '16px',
}

interface FormFieldProps {
  label?: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
}

export function FormField({ label, children, style }: FormFieldProps) {
  return (
    <div style={{ ...fieldStyle, ...style }}>
      {label && <label style={labelStyle}>{label}</label>}
      {children}
    </div>
  )
}

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  extraStyle?: React.CSSProperties
}

export function FormInput({ extraStyle, ...props }: FormInputProps) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      {...props}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
      style={{ ...(focused ? focusedInputStyle : baseInputStyle), ...extraStyle }}
    />
  )
}

interface FormTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  extraStyle?: React.CSSProperties
}

export function FormTextarea({ extraStyle, ...props }: FormTextareaProps) {
  const [focused, setFocused] = useState(false)
  return (
    <textarea
      {...props}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
      style={{
        ...(focused ? focusedInputStyle : baseInputStyle),
        resize: 'vertical',
        fontFamily: 'inherit',
        ...extraStyle,
      }}
    />
  )
}

interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  extraStyle?: React.CSSProperties
}

export function FormSelect({ extraStyle, children, ...props }: FormSelectProps) {
  const [focused, setFocused] = useState(false)
  return (
    <select
      {...props}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
      style={{
        ...(focused ? focusedInputStyle : baseInputStyle),
        appearance: 'none',
        ...extraStyle,
      }}
    >
      {children}
    </select>
  )
}
