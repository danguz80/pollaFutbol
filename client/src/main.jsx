import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css';
import 'bootstrap/dist/css/bootstrap.min.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Prevenir cambio de valores en inputs número con scroll
document.addEventListener('DOMContentLoaded', function() {
  document.addEventListener('wheel', function(e) {
    if (e.target.type === 'number') {
      e.preventDefault();
    }
  }, { passive: false });
});
