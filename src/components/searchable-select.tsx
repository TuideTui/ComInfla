'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export type SearchableOption = {
  value: string
  label: string
  meta?: string
  searchText?: string
}

type Props = {
  options: SearchableOption[]
  value: string
  onChange: (value: string) => void
  name?: string
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  ariaLabel?: string
  required?: boolean
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function SearchableSelect({
  options,
  value,
  onChange,
  name,
  placeholder = 'Selecione',
  searchPlaceholder = 'Buscar...',
  emptyMessage = 'Nenhum resultado encontrado.',
  ariaLabel,
  required,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)

  const selected = useMemo(() => options.find((option) => option.value === value), [options, value])
  const filtered = useMemo(() => {
    const term = normalize(query)
    if (!term) return options
    return options.filter((option) => normalize(`${option.label} ${option.meta ?? ''} ${option.searchText ?? ''}`).includes(term))
  }, [options, query])

  useEffect(() => {
    function closeOnOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    return () => document.removeEventListener('mousedown', closeOnOutside)
  }, [])

  useEffect(() => {
    if (!open) return
    setQuery('')
    const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
    setHighlighted(selectedIndex)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open, options, value])

  useEffect(() => {
    if (highlighted >= filtered.length) setHighlighted(Math.max(0, filtered.length - 1))
  }, [filtered.length, highlighted])

  function choose(option: SearchableOption) {
    onChange(option.value)
    setOpen(false)
    setQuery('')
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted((current) => filtered.length ? (current + 1) % filtered.length : 0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((current) => filtered.length ? (current - 1 + filtered.length) % filtered.length : 0)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = filtered[highlighted]
      if (option) choose(option)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className={`searchable-select${open ? ' open' : ''}`} ref={rootRef}>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <button
        type="button"
        className="searchable-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span className={selected ? '' : 'placeholder'}>
          <strong>{selected?.label ?? placeholder}</strong>
          {selected?.meta ? <small>{selected.meta}</small> : null}
        </span>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 7.5 4.5 4.5 4.5-4.5" /></svg>
      </button>

      {open ? (
        <div className="searchable-select-popover">
          <div className="searchable-select-search">
            <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m12.5 12.5 4 4" /></svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setHighlighted(0) }}
              onKeyDown={handleSearchKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              autoComplete="off"
            />
            {query ? <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus() }} aria-label="Limpar busca">×</button> : null}
          </div>

          <div className="searchable-select-list" role="listbox">
            {filtered.length ? filtered.map((option, index) => (
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`${option.value === value ? 'selected ' : ''}${index === highlighted ? 'highlighted' : ''}`.trim()}
                key={option.value}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => choose(option)}
              >
                <span>
                  <strong>{option.label}</strong>
                  {option.meta ? <small>{option.meta}</small> : null}
                </span>
                {option.value === value ? <b aria-hidden="true">✓</b> : null}
              </button>
            )) : <div className="searchable-select-empty">{emptyMessage}</div>}
          </div>
          <div className="searchable-select-count">{filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}</div>
        </div>
      ) : null}
    </div>
  )
}
