/**
 * Stub for googleapis - for TypeScript compilation only
 * This allows the code to compile without the actual googleapis dependency
 */

export interface OAuth2Client {
  setCredentials(credentials: any): void;
  generateAuthUrl(options: any): string;
  getToken(code: string): Promise<{ tokens: any }>;
  refreshAccessToken(): Promise<{ credentials: any }>;
}

export const google = {
  gmail: (options: any) => ({
    users: {
      getProfile: (params: any) => Promise.resolve({ data: {} }),
      messages: {
        list: (params: any) => Promise.resolve({ data: { messages: [] } }),
        get: (params: any) => Promise.resolve({ data: {} })
      }
    }
  })
};

export namespace gmail_v1 {
  export interface Gmail {
    users: any;
  }
}