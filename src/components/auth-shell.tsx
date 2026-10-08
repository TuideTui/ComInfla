import { Brand } from './brand'

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <div className="ambient ambient-auth-a" />
      <div className="ambient ambient-auth-b" />
      <Brand href="/" className="auth-brand" />
      <section className="auth-wrap">{children}</section>
    </main>
  )
}

export function Notice({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null
  return <div className={`notice ${error ? 'notice-error' : 'notice-success'}`}>{error ?? message}</div>
}
