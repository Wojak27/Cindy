/**
 * Stub for google-auth-library - for TypeScript compilation only
 */

export class OAuth2Client {
  constructor(clientId?: string, clientSecret?: string, redirectUri?: string) {}
  
  setCredentials(credentials: any): void {}
  generateAuthUrl(options: any): string { return ''; }
  async getToken(code: string): Promise<{ tokens: any }> { return { tokens: {} }; }
  async refreshAccessToken(): Promise<{ credentials: any }> { return { credentials: {} }; }
}