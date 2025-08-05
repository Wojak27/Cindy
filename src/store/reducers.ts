import { combineReducers } from 'redux';
import { settingsReducer } from './reducers/settingsReducer';
import { messagesReducer } from './reducers/messagesReducer';
import { uiReducer } from './reducers/uiReducer';

// Combine all reducers
const rootReducer = combineReducers({
    settings: settingsReducer,
    messages: messagesReducer,
    ui: uiReducer
});

export { rootReducer };
