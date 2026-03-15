import { useState } from "react"
import Sidebar from "./components/Sidebar"
import OverviewPage from "./pages/OverviewPage"
import DecisionsPage from "./pages/DecisionsPage"
import DecisionDetailPage from "./pages/DecisionDetailPage"
import styles from "./App.module.css"

export type Page =
  | { name: "overview" }
  | { name: "decisions" }
  | { name: "decision-detail"; id: string }

export default function App() {
  const [page, setPage] = useState<Page>({ name: "overview" })

  function navigate(p: Page) {
    setPage(p)
  }

  return (
    <div className={styles.layout}>
      <Sidebar currentPage={page.name} onNavigate={navigate} />
      <main className={styles.main}>
        {page.name === "overview" && <OverviewPage onNavigate={navigate} />}
        {page.name === "decisions" && <DecisionsPage onNavigate={navigate} />}
        {page.name === "decision-detail" && (
          <DecisionDetailPage id={page.id} onNavigate={navigate} />
        )}
      </main>
    </div>
  )
}
