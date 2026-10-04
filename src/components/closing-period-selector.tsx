'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

type PeriodOption = {
  value: string
  label: string
  hasData: boolean
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

  function changePeriod(next: string) {
    startTransition(() => {
      router.push(`/app/fechamento?period=${encodeURIComponent(next)}`)
    })
  }

  return (
    <div className="closing-period-control">
      <div>
        <span>Período do fechamento</span>
        <small>Você pode voltar a qualquer mês que já foi encerrado.</small>
      </div>
      <div className="closing-period-select-wrap">
        <select
          aria-label="Selecionar período do fechamento"
          value={value}
          onChange={(event) => changePeriod(event.target.value)}
          disabled={pending}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}{option.hasData ? '' : ' · sem compras'}
            </option>
          ))}
        </select>
        <span className="closing-period-chevron">⌄</span>
      </div>
    </div>
  )
}
