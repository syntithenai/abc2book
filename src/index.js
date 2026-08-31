import React from 'react';
import ReactDOM from 'react-dom/client';
import './reactBootstrapDropdownPatch';
import './index.css';
import './breakpoints.css';
import { installYoutubeDetachedPlayerErrorHandlers } from './youtubePlayerErrors';
import { installUnhandledNetworkErrorHandlers } from './networkRequestErrors';
import { toast } from 'react-toastify';
import { applyColorScheme, getColorScheme } from './colorSchemeSettings';
import App from './App';
import reportWebVitals from './reportWebVitals';

applyColorScheme(getColorScheme());
installYoutubeDetachedPlayerErrorHandlers();
installUnhandledNetworkErrorHandlers(function(message) {
  toast.error(message);
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
