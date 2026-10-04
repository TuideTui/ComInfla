import { formatBRL, formatPercent } from './format'

export type InsightLike = {
  insight_type?: string | null
  title: string
  message: string
  metric_value?: number | string | null
  metadata?: Record<string, unknown> | null
  severity?: string | null
}

export function insightDescription(insight: InsightLike) {
  const metric = insight.metric_value === null || insight.metric_value === undefined ? null : Number(insight.metric_value)
  const metadata = insight.metadata ?? {}

  switch (insight.insight_type) {
    case 'above_historical_average':
      return metric !== null
        ? `Você pagou ${formatPercent(Math.abs(metric))} acima do seu preço médio por este produto.`.replace('+', '')
        : insight.message
    case 'below_historical_average':
      return metric !== null
        ? `Ótima compra: este valor ficou ${formatPercent(-Math.abs(metric))} em relação à sua média histórica.`
        : insight.message
    case 'new_lowest_price': {
      const previous = Number(metadata.previous_lowest_cents ?? 0)
      return previous
        ? `Este é o menor preço que você já pagou por este produto. O menor anterior era ${formatBRL(previous)}.`
        : insight.message
    }
    case 'new_highest_price': {
      const previous = Number(metadata.previous_highest_cents ?? 0)
      return previous
        ? `Este é o maior preço que você já pagou por este produto. O maior anterior era ${formatBRL(previous)}.`
        : insight.message
    }
    case 'same_establishment_change': {
      const previous = Number(metadata.previous_price_cents ?? 0)
      const current = Number(metadata.current_price_cents ?? 0)
      if (previous && current && metric !== null) {
        return `Na última compra deste produto neste local, você pagou ${formatBRL(previous)}. Agora foi ${formatBRL(current)} (${formatPercent(metric)}).`
      }
      return insight.message
    }
    default:
      return insight.message
  }
}
