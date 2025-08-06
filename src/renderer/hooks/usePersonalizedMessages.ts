import { useSelector } from 'react-redux';
import { 
    createPersonalizedMessages, 
    getPersonalizedMessage, 
    getRandomMessage,
    PersonalizedMessage 
} from '../utils/personalizedMessages';

export const usePersonalizedMessages = () => {
    const settings = useSelector((state: any) => state.settings);
    const userName = settings?.profile?.name || '';
    
    const personalizedMessages = createPersonalizedMessages(userName);
    
    const getMessage = (category: keyof PersonalizedMessage): string => {
        return getPersonalizedMessage(userName, category);
    };
    
    const getRandomFromCategory = (category: keyof PersonalizedMessage): string => {
        return getRandomMessage(personalizedMessages[category]);
    };
    
    return {
        userName,
        personalizedMessages,
        getMessage,
        getRandomFromCategory,
        hasName: userName.trim() !== ''
    };
};

export default usePersonalizedMessages;