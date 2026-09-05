import { Outlet } from 'react-router-dom'
import AuthNav from './AuthNav'

export default function AuthenticatedLayout() {
  return (
    <div className="authenticated-app">
      <AuthNav />
      <main className="authenticated-app__main">
        <Outlet />
      </main>
    </div>
  )
}
