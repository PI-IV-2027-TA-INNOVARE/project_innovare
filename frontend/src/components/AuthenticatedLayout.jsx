import { Link, Outlet } from 'react-router-dom'
import AuthNav from './AuthNav'
import AvisoDeContaTrocada from './AvisoDeContaTrocada'

export default function AuthenticatedLayout() {
  return (
    <div className="authenticated-app">
      <AuthNav />
      <main className="authenticated-app__main">
        <AvisoDeContaTrocada />
        <Outlet />
      </main>
      <footer className="authenticated-app__rodape">
        <Link to="/privacidade">Privacidade e seus dados</Link>
      </footer>
    </div>
  )
}
