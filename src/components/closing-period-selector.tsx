'use client'

import { useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SearchableSelect, type SearchableOption } from '@/components/searchable-select'

type PeriodOption = {
  value: string
  label: string
  hasData: boolean
}

function parsePeriod(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  return match ? { year: match[1], month: match[2] } : null
}

function monthLabel(year: string, month: string) {
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(Number(year), Number(month) - 1, 1))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function ClosingPeriodSelector({
  value,
  options,
}: {
  value: string
  options: PeriodOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const selected = parsePeriod(value)
  const selectedYear = selected?.year ?? options[0]?.value.slice(0, 4) ?? String(new Date().getFullYear())

  const yearOptions = useMemo<SearchableOption[]>(() => {
    const years = [...new Set(options.map((option) => option.value.slice(0, 4)))]
    return years.map((year) => {
      const periodsInYear = options.filter((option) => option.value.startsWith(`${year}-`))
      const withData = periodsInYear.filter((option) => option.hasData).length
      return {
        value: year,
        label: year,
        meta: `${periodsInYear.length} ${periodsInYear.length === 1 ? 'mês encerrado' : 'meses encerrados'}${withData ? ` · ${withData} com compras` : ''}`,
        searchText: year,
      }
    })
  }, [options])

  const periodsInSelectedYear = useMemo(
    () => options.filter((option) => option.value.startsWith(`${selectedYear}-`)),
    [options, selectedYear]
  )

  const monthOptions = useMemo<SearchableOption[]>(() => periodsInSelectedYear.map((option) => {
    const parsed = parsePeriod(option.value)
    const label = parsed ? monthLabel(parsed.year, parsed.month) : option.label
    return {
      value: option.value,
      label,
      meta: option.hasData ? 'Fechamento com compras registradas' : 'Sem compras registradas',
      searchText: `${label} ${option.label}`,
    }
  }), [periodsInSelectedYear])

  function changePeriod(next: string) {
    if (!next || next === value) return
    startTransition(() => {
      router.push(`/app/fechamento?period=${encodeURIComponent(next)}`)
    })
  }

  function changeYear(nextYear: string) {
    const currentMonth = selected?.month
    const sameMonth = options.find((option) => option.value === `${nextYear}-${currentMonth}`)
    const fallback = options.find((option) => option.value.startsWith(`${nextYear}-`))
    changePeriod((sameMonth ?? fallback)?.value ?? value)
  }

  return (
    <div className={`closing-period-control${pending ? ' is-pending' : ''}`}>
      <div className="closing-period-copy">
        <span>Período do fechamento</span>
        <small>Escolha mês e ano separadamente para consultar qualquer período já encerrado.</small>
      </div>

      <div className="closing-period-fields" aria-busy={pending}>
        <label className="closing-period-field">
          <span>Mês</span>
          <SearchableSelect
            value={value}
            options={monthOptions}
            onChange={changePeriod}
            placeholder="Escolha o mês"
            searchPlaceholder="Buscar mês..."
            emptyMessage="Nenhum mês encerrado neste ano."
            ariaLabel="Selecionar mês do fechamento"
          />
        </label>

        <label className="closing-period-field closing-year-field">
          <span>Ano</span>
          <SearchableSelect
            value={selectedYear}
            options={yearOptions}
            onChange={changeYear}
            placeholder="Escolha o ano"
            searchPlaceholder="Buscar ano..."
            emptyMessage="Nenhum ano disponível."
            ariaLabel="Selecionar ano do fechamento"
          />
        </label>
      </div>
    </div>
  )
}
