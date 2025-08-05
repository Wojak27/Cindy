import { createStore, applyMiddleware } from 'redux';
import { persistenceMiddleware } from '../../store/middleware/persistenceMiddleware';
import { rootReducer } from '../../store/reducers';

// Create a store instance for the renderer process
const store = createStore(
    rootReducer,
    applyMiddleware(persistenceMiddleware)
);

export default store;