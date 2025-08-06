import { useSelector } from 'react-redux';

// Define the Settings interface to match the store structure
// interface LLMSettings {
//     provider: string;
//     ollama: {
//         model: string;
//         baseUrl: string;
//         temperature: number;
//     };
//     openai: {
//         model: string;
//         apiKey: string;
//         organizationId?: string;
//         temperature: number;
//         maxTokens: number;
//     };
// }

// interface VoiceSettings {
//     activationPhrase: string;
//     sttProvider: string;
//     wakeWordSensitivity: number;
//     voiceSpeed: number;
//     voicePitch: number;
// }

// interface ProfileSettings {
//     name: string;
//     surname: string;
//     hasCompletedSetup: boolean;
// }

// interface Settings {
//     theme: string;
//     voice: VoiceSettings;
//     wakeWord: string;
//     autoStart: boolean;
//     notifications: boolean;
//     llm: LLMSettings;
//     profile: ProfileSettings;
//     // Blob animation settings
//     blobSensitivity?: number;
//     blobStyle?: 'subtle' | 'moderate' | 'intense';
// }
// The Settings interface was accidentally uncommented and caused a syntax error
// It has been properly commented out to resolve the TS6196 error
// interface Settings {
//     theme: string;
//     voice: VoiceSettings;
//     wakeWord: string;
//     autoStart: boolean;
//     notifications: boolean;
//     llm: LLMSettings;
//     profile: ProfileSettings;
//     // Blob animation settings
//     blobSensitivity?: number;
//     blobStyle?: 'subtle' | 'moderate' | 'intense';
// }

// Custom hook to access settings from Redux store
export const useSettings = () => {
    const settings = useSelector((state: any) => state.settings);

    // Provide default values for blob settings if they don't exist
    return {
        ...settings,
        blobSensitivity: settings.blobSensitivity ?? 0.5,
        blobStyle: settings.blobStyle ?? 'moderate'
    };
};

// Type guard to check if a value is a valid blob style
export const isValidBlobStyle = (value: any): value is 'subtle' | 'moderate' | 'intense' => {
    return ['subtle', 'moderate', 'intense'].includes(value);
};