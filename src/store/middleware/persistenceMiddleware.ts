export const persistenceMiddleware = () => (next: any) => (action: any) => {
    return next(action);
};
