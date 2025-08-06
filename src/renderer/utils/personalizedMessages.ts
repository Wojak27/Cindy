// Personalized messages using user's name
export interface PersonalizedMessage {
    greeting: string[];
    thinking: string[];
    helpOffer: string[];
    farewell: string[];
    encouragement: string[];
    acknowledgment: string[];
}

export const createPersonalizedMessages = (name: string): PersonalizedMessage => {
    const firstName = name.trim() || 'there';
    
    return {
        greeting: [
            `Hello ${firstName}! How can I help you today?`,
            `Hi ${firstName}! What would you like to know?`,
            `Good to see you, ${firstName}! How can I assist?`,
            `Hey ${firstName}! What's on your mind?`,
            `Welcome back, ${firstName}! How can I help?`,
            `Hi there, ${firstName}! What can I do for you?`,
        ],
        
        thinking: [
            `Let me think about that for you, ${firstName}...`,
            `Give me a moment to process this, ${firstName}.`,
            `I'm working on that for you, ${firstName}.`,
            `Analyzing your question, ${firstName}...`,
            `Let me consider this carefully, ${firstName}.`,
        ],
        
        helpOffer: [
            `Is there anything else I can help you with, ${firstName}?`,
            `What else would you like to explore, ${firstName}?`,
            `Any other questions for me, ${firstName}?`,
            `How else can I assist you today, ${firstName}?`,
            `What else is on your mind, ${firstName}?`,
        ],
        
        farewell: [
            `Take care, ${firstName}!`,
            `See you later, ${firstName}!`,
            `Have a great day, ${firstName}!`,
            `Until next time, ${firstName}!`,
            `Goodbye for now, ${firstName}!`,
        ],
        
        encouragement: [
            `That's a great question, ${firstName}!`,
            `Excellent thinking, ${firstName}!`,
            `I'm impressed by your curiosity, ${firstName}!`,
            `You're asking all the right questions, ${firstName}!`,
            `Great point, ${firstName}!`,
        ],
        
        acknowledgment: [
            `I understand, ${firstName}.`,
            `Got it, ${firstName}!`,
            `Makes sense, ${firstName}.`,
            `I see what you mean, ${firstName}.`,
            `Absolutely, ${firstName}!`,
        ]
    };
};

export const getRandomMessage = (messages: string[]): string => {
    return messages[Math.floor(Math.random() * messages.length)];
};

// Helper function to get a random personalized message by category
export const getPersonalizedMessage = (
    name: string, 
    category: keyof PersonalizedMessage
): string => {
    const personalizedMessages = createPersonalizedMessages(name);
    return getRandomMessage(personalizedMessages[category]);
};

// Special welcome message for new users
export const getWelcomeMessage = (name: string): string => {
    const firstName = name.trim();
    if (!firstName) {
        return "Welcome! I'm Cindy, your AI assistant. Feel free to ask me anything!";
    }
    
    const welcomeMessages = [
        `Welcome, ${firstName}! I'm Cindy, your personal AI assistant. I'm here to help with research, answer questions, and assist with various tasks. What would you like to explore today?`,
        `Hello ${firstName}! Nice to meet you. I'm Cindy, and I'm excited to be your AI companion. I can help with research, writing, analysis, and much more. How can I get started helping you?`,
        `Hi there, ${firstName}! I'm Cindy, your intelligent assistant. I'm designed to help you with research, provide insights, and support your work. What interesting topic shall we dive into first?`,
    ];
    
    return getRandomMessage(welcomeMessages);
};

// Function to check if it's the user's first interaction
export const shouldShowWelcome = (name: string, hasCompletedSetup: boolean): boolean => {
    return name.trim() !== '' && !hasCompletedSetup;
};