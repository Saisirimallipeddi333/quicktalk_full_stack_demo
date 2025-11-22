import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App' 
import "./styles.css";     

// make `global` exist in the browser for sockjs-client
;(window as any).global = window

ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
