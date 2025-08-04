declare class AutoLaunch {
    constructor(options: {
        name: string;
        isHidden?: boolean;
        path?: string;
        mac?: {
            useLaunchAgent?: boolean;
        };
        linux?: {
            isHidden?: boolean;
        };
    });
    isEnabled(): Promise<boolean>;
    enable(): Promise<void>;
    disable(): Promise<void>;
}

declare namespace AutoLaunch { }

export = AutoLaunch;