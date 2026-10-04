import type { Metadata } from 'next'
import './globals.css'
import './app.css'
import './insights.css'

export const metadata: Metadata = {
  title: 'ComInfla — Sua inflação pessoal',
  description: 'Acompanhe preços, entenda sua inflação pessoal e transforme compras do dia a dia em inteligência sobre seu custo de vida.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
