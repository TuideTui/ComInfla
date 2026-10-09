export default function AppLoading() {
  return (
    <main className="app-shell app-loading-page" aria-busy="true" aria-label="Carregando conteúdo">
      <section className="app-content">
        <div className="app-skeleton-heading">
          <div>
            <span className="skeleton skeleton-kicker" />
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-copy" />
          </div>
          <span className="skeleton skeleton-action" />
        </div>

        <div className="app-skeleton-grid">
          <span className="skeleton skeleton-card" />
          <span className="skeleton skeleton-card" />
          <span className="skeleton skeleton-card" />
          <span className="skeleton skeleton-card" />
        </div>

        <div className="app-skeleton-main-grid">
          <span className="skeleton skeleton-panel skeleton-panel-large" />
          <span className="skeleton skeleton-panel" />
        </div>
      </section>
    </main>
  )
}
