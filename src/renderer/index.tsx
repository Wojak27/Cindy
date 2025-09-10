// Load polyfills before anything else
import './polyfills';

// Ensure TTSWorker IPC listener is registered as early as possible
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import App from './App';
import store from './store/store';
import './styles/settings-sidebar.css';

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);

const renderApp = () => {
    root.render(
        <React.StrictMode>
            <Provider store={store}>
                <App />
            </Provider>
        </React.StrictMode>
    );
};

// Initial render
renderApp();

// Enable Hot Module Replacement for development
if (process.env.NODE_ENV === 'development' && module.hot) {
    module.hot.accept('./App', () => {
        console.log('🔥 Hot reloading App component');
        renderApp();
    });
    
    module.hot.accept('./store/store', () => {
        console.log('🔥 Hot reloading Redux store');
        renderApp();
    });
}