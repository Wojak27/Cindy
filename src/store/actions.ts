export const getSettings = () => ({
    type: 'GET_SETTINGS'
});

export const updateSettings = (settings: any) => ({
    type: 'UPDATE_SETTINGS',
    payload: settings
});