import React from 'react';
import ReactDOM from 'react-dom/client';
import Router from './Router';
import './tokens.css';
import './style.css';
import './booking.css';
import './reservations.css';
import './admin-dashboard.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Router /></React.StrictMode>);
