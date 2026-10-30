import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import AuthPage from './pages/AuthPage';
import ResourceDetailPage from './pages/ResourceDetailPage';
import DashboardPage from './pages/DashboardPage';

export default function Router() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/" element={<App key="explore"/>}/>
    <Route path="/login" element={<AuthPage mode="login"/>}/>
    <Route path="/register" element={<AuthPage mode="register"/>}/>
    <Route path="/resources/:id" element={<ResourceDetailPage/>}/>
    <Route element={<ProtectedRoute/>}><Route path="/dashboard" element={<DashboardPage/>}/></Route>
    <Route element={<ProtectedRoute/>}><Route path="/bookings" element={<App key="bookings" view="bookings"/>}/></Route>
    <Route element={<ProtectedRoute admin/>}><Route path="/admin" element={<App key="admin" view="admin"/>}/></Route>
    <Route element={<ProtectedRoute admin/>}><Route path="/admin/bookings" element={<App key="reservations" view="reservations"/>}/></Route>
    <Route element={<ProtectedRoute admin/>}><Route path="/admin/dashboard" element={<DashboardPage admin/>}/></Route>
    <Route path="/forbidden" element={<main className="auth-page"><section className="auth-panel"><h1>Administrator access required.</h1><p className="muted my-5">Your account does not have permission to manage campus resources.</p><Link to="/" className="primary">Back to resources</Link></section></main>}/>
    <Route path="*" element={<main className="auth-page"><section className="auth-panel"><h1>Page not found.</h1><Link to="/" className="primary mt-5">Back to resources</Link></section></main>}/>
  </Routes></AuthProvider></BrowserRouter>;
}
