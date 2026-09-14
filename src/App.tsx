import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { AppLayout } from './components/AppLayout'
import { RequireAuth } from './components/RequireAuth'
import { RequireRole } from './components/RequireRole'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ProfilePage from './pages/ProfilePage'
import HrPage from './pages/HrPage'
import AdminPage from './pages/AdminPage'
import AuthCallback from './pages/AuthCallback'
import EmployeesPage from './pages/EmployeesPage'
import CreateEmployeePage from './pages/CreateEmployeePage'
import EmployeeDetailPage from './pages/EmployeeDetailPage'
import EditEmployeePage from './pages/EditEmployeePage'
import { EMPLOYEE_MANAGER_ROLES } from './lib/employee-domain'

const router = createBrowserRouter([
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      {
        path: '/',
        element: <Dashboard />,
      },
      {
        path: '/profile',
        element: <ProfilePage />,
      },
      {
        path: '/hr',
        element: (
          <RequireRole roles={['admin', 'hr']}>
            <HrPage />
          </RequireRole>
        ),
      },
      {
        path: '/hr/employees',
        element: (
          <RequireRole roles={EMPLOYEE_MANAGER_ROLES}>
            <EmployeesPage />
          </RequireRole>
        ),
      },
      {
        path: '/hr/employees/new',
        element: (
          <RequireRole roles={EMPLOYEE_MANAGER_ROLES}>
            <CreateEmployeePage />
          </RequireRole>
        ),
      },
      {
        path: '/hr/employees/:id',
        element: (
          <RequireRole roles={EMPLOYEE_MANAGER_ROLES}>
            <EmployeeDetailPage />
          </RequireRole>
        ),
      },
      {
        path: '/hr/employees/:id/edit',
        element: (
          <RequireRole roles={EMPLOYEE_MANAGER_ROLES}>
            <EditEmployeePage />
          </RequireRole>
        ),
      },
      {
        path: '/admin',
        element: (
          <RequireRole roles={['admin']}>
            <AdminPage />
          </RequireRole>
        ),
      },
    ],
  },
  { path: '/login', element: <Login /> },
  { path: '/auth/callback', element: <AuthCallback /> },
  { path: '*', element: <Navigate to="/" replace /> },
])

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}

export default App
