'use client'

import { useState } from 'react'

// Base styles shared across all inputs.
// fontSize MUST be >= 16px on inputs/textareas/selects to prevent iOS Safari
// from auto-zooming the viewport on focus. iOS Safari treats anything below
// 16px as "the user can't read this, let me zoom in," and the viewport stays
// stuck zoomed until the user pinches out manually. Mario uses this app on
// his iPhone all day — every form field was triggering the zoom.
const baseInputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '12px',
  color: 'var(--text-primary)',
  fontSize: '16px',
  outline: 'none',
  boxSizing: 'border-box',
  // Refinement Task 3: animate both border-color AND box-shadow so the
  // focus ring fades in smoothly. Using the motion token (globals.css)
  // keeps timing consistent with the rest of the app.
  transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
}

// Refinement Task 3: visible focus ring. Previously focus only changed
// border color — a 1px green border on a dark background is easy to miss,
// especially on an iPhone glance. Now the focus state adds a 2px glow
// outside the border via box-shadow, which reads as a proper focus ring
// without moving the element's layout box (outline would).
const focusedInputStyle: React.CSSProperties = {
  ...baseInputStyle,
  borderColor: 'var(--accent)',
  boxShadow: '0 0 0 2px var(--accent-glow)',
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
