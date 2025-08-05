import { createStore, applyMiddleware } from 'redux';
import { persistenceMiddleware, loadInitialSettings } from '../../store/middleware/persistenceMiddleware';
import { rootReducer } from '../../store/reducers';

// Create a store instance for the renderer process
let initialState = {};

// The settings service will be set by main process
// Load initial settings after the service is available
loadInitialSettings().then(settings => {
    initialState = settings;
    // Re-create the store with the loaded settings
    store.replaceReducer(rootReducer);
}).catch(console.error);

const store = createStore(
    rootReducer,
    initialState,
    applyMiddleware(persistenceMiddleware)
);

export default store;