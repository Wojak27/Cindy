/**
 * Stub for @microsoft/microsoft-graph-client - for TypeScript compilation only
 */

export interface AuthenticationProvider {
  getAccessToken(): Promise<string>;
}

export class Client {
  static initWithMiddleware(options: any): Client {
    return new Client();
  }
  
  api(endpoint: string): any {
    return {
      get: () => Promise.resolve({}),
      top: () => this,
      select: () => this,
      orderby: () => this,
      search: () => this,
      filter: () => this
    };
  }
}