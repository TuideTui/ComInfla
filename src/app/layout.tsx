import type { Metadata } from 'next'
import 'leaflet/dist/leaflet.css'
import './globals.css'
import './brand.css'
import './landing.css'
import './feature-steps.css'
import './landing-motion.css'
import './app.css'
import './insights.css'
import './catalog.css'
import './polish.css'
import './closing-history.css'
import './compare.css'
import './registering.css'
import './registering-modal.css'
import './app-performance.css'
import './account-settings-v2.css'
import './account-mobile.css'
import './auth-transition.css'
import './landing-mobile.css'
import './receipt-import.css'
import './receipt-import-polish.css'
import './purchase-modes.css'
import './receipt-quality.css'
import { LandingLiveEffects } from '../components/landing-live-effects'

export const metadata: Metadata = {
  title: 'ComInfla — Sua inflação pessoal',
  description: 'Acompanhe preços, entenda sua inflação pessoal e transforme compras do dia a dia em inteligência sobre seu custo de vida.',
  icons: {
    icon: [{ url: '/cominfla-logo.png?v=4', type: 'image/png' }],
    shortcut: '/cominfla-logo.png?v=4',
    apple: '/cominfla-logo.png?v=4',
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <LandingLiveEffects />
        {children}
      </body>
    </html>
  )
}
