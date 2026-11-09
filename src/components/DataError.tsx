export function DataError({ errors }: { errors: string[] }) {
  return (
    <main className="content">
      <section className="data-error" role="alert" aria-labelledby="data-error-title">
        <h1 id="data-error-title">Maintenance data could not load</h1>
        <p>
          The source CSV files contain problems. No tasks are shown, so the page never presents an incomplete list
          as complete. Correct the files below, then refresh the page.
        </p>
        <ul>
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      </section>
    </main>
  )
}
