import { createStore, applyMiddleware } from 'redux';
import { persistenceMiddleware, loadInitialSettings } from '../../store/middleware/persistenceMiddleware';
import { rootReducer } from '../../store/reducers';

// Create a store instance for the renderer process
let initialState = {};
loadInitialSettings().then(settings => {
    initialState = settings;
}).catch(console.error);

const store = createStore(
    rootReducer,
    initialState,
    applyMiddleware(persistenceMiddleware)
);

export default store;