# Cindy - Security and Secrets Management

## Requirements

1. Storage mechanism for sensitive data
2. Encryption-at-rest strategy
3. No secrets written in plaintext
4. Secure handling of API keys and tokens
5. Cross-platform compatibility
6. Compliance with security best practices

## Selected Technologies

### Electron's Built-in Security Features
- Secure storage via `safeStorage` API
- Sandboxed renderer processes
- Context isolation
- Secure IPC communication

### Node-keytar (Cross-platform Credential Storage)
- Native OS credential storage
- Keychain (macOS), Credential Vault (Windows), libsecret (Linux)
- Secure encryption at rest
- No plaintext storage

## Implementation Architecture

```
src/
├── main/
│   ├── services/
│   │   ├── SecurityService.ts
│   │   ├── SecretsManager.ts
│   │   └── EncryptionService.ts
│   └── utils/
│       └── SecureStorage.ts
├── renderer/
│   └── components/
│       └── SecuritySettings.tsx
└── shared/
    └── types/
        └── security.types.ts
```

## Core Components

### 1. Security Service (Main Interface)

```typescript
// SecurityService.ts
import { EventEmitter } from 'events';
import { SecretsManager } from './SecretsManager';
import { EncryptionService } from './EncryptionService';
import { SecureStorage } from '../utils/SecureStorage';

interface SecurityConfig {
  encryptLocalStorage: boolean;
  requireAuthentication: boolean;
  authenticationTimeout: number; // in minutes
  enableBiometricAuth: boolean;
}

interface SecurityEvent {
  type: 'encryption_enabled' | 'encryption_disabled' | 'authentication_required' | 'authentication_granted';
  timestamp: Date;
  details?: any;
}

class SecurityService extends EventEmitter {
  private secretsManager: SecretsManager;
  private encryptionService: EncryptionService;
  private secureStorage: SecureStorage;
  private config: SecurityConfig;
  private isAuthenticated: boolean = false;
  private authTimeout: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;

  constructor(config: SecurityConfig) {
    super();
    this.config = config;
    this.secretsManager = new SecretsManager();
    this.encryptionService = new EncryptionService();
    this.secureStorage = new SecureStorage();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize secrets manager
      await this.secretsManager.initialize();
      
      // Initialize encryption service
      await this.encryptionService.initialize();
      
      // Initialize secure storage
      await this.secureStorage.initialize();
      
      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      console.error('Failed to initialize security service:', error);
      throw error;
    }
  }

  async storeSecret(key: string, value: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Store in secure OS credential storage
      await this.secretsManager.setSecret(key, value);
      
      this.emit('secretStored', { key });
    } catch (error) {
      console.error('Failed to store secret:', error);
      throw error;
    }
  }

  async retrieveSecret(key: string): Promise<string | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Retrieve from secure OS credential storage
      const secret = await this.secretsManager.getSecret(key);
      return secret;
    } catch (error) {
      console.error('Failed to retrieve secret:', error);
      return null;
    }
  }

  async deleteSecret(key: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Delete from secure OS credential storage
      await this.secretsManager.deleteSecret(key);
      
      this.emit('secretDeleted', { key });
    } catch (error) {
      console.error('Failed to delete secret:', error);
      throw error;
    }
  }

  async encrypt(data: string): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      if (this.config.encryptLocalStorage) {
        return await this.encryptionService.encrypt(data);
      }
      return data;
    } catch (error) {
      console.error('Failed to encrypt data:', error);
      throw error;
    }
  }

  async decrypt(encryptedData: string): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      if (this.config.encryptLocalStorage) {
        return await this.encryptionService.decrypt(encryptedData);
      }
      return encryptedData;
    } catch (error) {
      console.error('Failed to decrypt data:', error);
      throw error;
    }
  }

  async authenticate(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Check if biometric authentication is enabled and available
      if (this.config.enableBiometricAuth && await this.isBiometricAvailable()) {
        const result = await this.requestBiometricAuth();
        if (result) {
          return this.grantAuthentication();
        }
        return false;
      }

      // Fallback to password-based authentication
      const result = await this.requestPasswordAuth();
      if (result) {
        return this.grantAuthentication();
      }
      return false;
    } catch (error) {
      console.error('Authentication failed:', error);
      return false;
    }
  }

  isAuthenticatedUser(): boolean {
    return this.isAuthenticated;
  }

  async requireAuthentication(): Promise<boolean> {
    if (!this.config.requireAuthentication) {
      return true;
    }

    if (this.isAuthenticated) {
      // Reset timeout
      if (this.authTimeout) {
        clearTimeout(this.authTimeout);
      }
      
      this.authTimeout = setTimeout(() => {
        this.revokeAuthentication();
      }, this.config.authenticationTimeout * 60 * 1000);
      
      return true;
    }

    return await this.authenticate();
  }

  async updateConfig(newConfig: Partial<SecurityConfig>): Promise<void> {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    // Handle encryption setting changes
    if (newConfig.encryptLocalStorage !== undefined && 
        newConfig.encryptLocalStorage !== oldConfig.encryptLocalStorage) {
      if (newConfig.encryptLocalStorage) {
        this.emit('encryptionEnabled');
      } else {
        this.emit('encryptionDisabled');
      }
    }
    
    // Handle authentication setting changes
    if (newConfig.requireAuthentication !== undefined && 
        newConfig.requireAuthentication !== oldConfig.requireAuthentication) {
      if (newConfig.requireAuthentication) {
        this.emit('authenticationRequired');
      }
    }
    
    this.emit('configUpdated', this.config);
  }

  getConfig(): SecurityConfig {
    return { ...this.config };
  }

  async close(): Promise<void> {
    if (this.authTimeout) {
      clearTimeout(this.authTimeout);
    }
    
    await this.secretsManager.close();
    await this.encryptionService.close();
    
    this.isInitialized = false;
    this.emit('closed');
  }

  // Private methods
  private async grantAuthentication(): Promise<boolean> {
    this.isAuthenticated = true;
    
    // Set timeout for automatic revocation
    if (this.authTimeout) {
      clearTimeout(this.authTimeout);
    }
    
    this.authTimeout = setTimeout(() => {
      this.revokeAuthentication();
    }, this.config.authenticationTimeout * 60 * 1000);
    
    this.emit('authenticationGranted');
    return true;
  }

  private revokeAuthentication(): void {
    this.isAuthenticated = false;
    this.emit('authenticationRevoked');
  }

  private async isBiometricAvailable(): Promise<boolean> {
    // In a real implementation, this would check for biometric availability
    // For now, we'll return false to use password authentication
    return false;
  }

  private async requestBiometricAuth(): Promise<boolean> {
    // In a real implementation, this would request biometric authentication
    // For now, we'll return false to use password authentication
    return false;
  }

  private async requestPasswordAuth(): Promise<boolean> {
    // In a real implementation, this would show a password dialog
    // For now, we'll simulate successful authentication
    console.log('Requesting password authentication');
    return true;
  }
}

export { SecurityService, SecurityConfig };
```

### 2. Secrets Manager

```typescript
// SecretsManager.ts
import keytar from 'keytar';

class SecretsManager {
  private serviceName: string = 'Cindy';
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Test keytar functionality
      await keytar.setPassword(this.serviceName, 'test', 'test');
      await keytar.deletePassword(this.serviceName, 'test');
      
      this.isInitialized = true;
      console.log('Secrets manager initialized');
    } catch (error) {
      console.error('Failed to initialize secrets manager:', error);
      throw error;
    }
  }

  async setSecret(account: string, password: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await keytar.setPassword(this.serviceName, account, password);
      console.log(`Secret stored for account: ${account}`);
    } catch (error) {
      console.error(`Failed to store secret for account ${account}:`, error);
      throw error;
    }
  }

  async getSecret(account: string): Promise<string | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const password = await keytar.getPassword(this.serviceName, account);
      return password;
    } catch (error) {
      console.error(`Failed to retrieve secret for account ${account}:`, error);
      return null;
    }
  }

  async deleteSecret(account: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const result = await keytar.deletePassword(this.serviceName, account);
      console.log(`Secret deleted for account: ${account}`);
      return result;
    } catch (error) {
      console.error(`Failed to delete secret for account ${account}:`, error);
      return false;
    }
  }

  async getAllAccounts(): Promise<Array<{ account: string; password: string }>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const accounts = await keytar.findCredentials(this.serviceName);
      return accounts;
    } catch (error) {
      console.error('Failed to retrieve all accounts:', error);
      return [];
    }
  }

  async close(): Promise<void> {
    // Cleanup if needed
    console.log('Secrets manager closed');
  }
}

export { SecretsManager };
```

### 3. Encryption Service

```typescript
// EncryptionService.ts
import * as crypto from 'crypto';

interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
}

class EncryptionService {
  private config: EncryptionConfig;
  private masterKey: Buffer | null = null;
  private isInitialized: boolean = false;

  constructor() {
    this.config = {
      algorithm: 'aes-256-gcm',
      keyLength: 32,
      ivLength: 16
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Generate or retrieve master key
      this.masterKey = await this.getOrCreateMasterKey();
      
      this.isInitialized = true;
      console.log('Encryption service initialized');
    } catch (error) {
      console.error('Failed to initialize encryption service:', error);
      throw error;
    }
  }

  async encrypt(plaintext: string): Promise<string> {
    if (!this.isInitialized || !this.masterKey) {
      await this.initialize();
    }

    try {
      // Generate a random initialization vector
      const iv = crypto.randomBytes(this.config.ivLength);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.config.algorithm, this.masterKey, iv);
      
      // Encrypt the plaintext
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get the authentication tag
      const tag = cipher.getAuthTag();
      
      // Combine IV, tag, and encrypted data
      const result = iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
      
      return result;
    } catch (error) {
      console.error('Failed to encrypt data:', error);
      throw error;
    }
  }

  async decrypt(encryptedData: string): Promise<string> {
    if (!this.isInitialized || !this.masterKey) {
      await this.initialize();
    }

    try {
      // Split the encrypted data into components
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }
      
      const iv = Buffer.from(parts[0], 'hex');
      const tag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];
      
      // Create decipher
      const decipher = crypto.createDecipheriv(this.config.algorithm, this.masterKey, iv);
      decipher.setAuthTag(tag);
      
      // Decrypt the data
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Failed to decrypt data:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    // Clear master key from memory
    if (this.masterKey) {
      crypto.randomFillSync(this.masterKey, 0, this.masterKey.length);
      this.masterKey = null;
    }
    
    this.isInitialized = false;
    console.log('Encryption service closed');
  }

  // Private methods
  private async getOrCreateMasterKey(): Promise<Buffer> {
    // In a real implementation, this would:
    // 1. Try to retrieve existing key from secure storage
    // 2. If not found, generate a new key
    // 3. Store the key securely
    
    // For now, we'll generate a deterministic key for development
    // In production, this should be a securely generated random key
    const keyMaterial = 'cindy-master-key-secret-material';
    return crypto.scryptSync(keyMaterial, 'salt', this.config.keyLength);
  }
}

export { EncryptionService };
```

### 4. Secure Storage Utility

```typescript
// SecureStorage.ts
import { app } from 'electron';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { EncryptionService } from '../services/EncryptionService';

interface SecureStorageConfig {
  encryptData: boolean;
}

class SecureStorage {
  private config: SecureStorageConfig;
  private encryptionService: EncryptionService;
  private storagePath: string;
  private isInitialized: boolean = false;

  constructor() {
    this.config = {
      encryptData: true
    };
    
    this.encryptionService = new EncryptionService();
    this.storagePath = join(app?.getPath('userData') || './data', 'secure-storage');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize encryption service
      await this.encryptionService.initialize();
      
      this.isInitialized = true;
      console.log('Secure storage initialized');
    } catch (error) {
      console.error('Failed to initialize secure storage:', error);
      throw error;
    }
  }

  async setItem(key: string, value: any): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      let dataToStore = JSON.stringify(value);
      
      // Encrypt if enabled
      if (this.config.encryptData) {
        dataToStore = await this.encryptionService.encrypt(dataToStore);
      }
      
      // Write to file
      const filePath = join(this.storagePath, `${key}.dat`);
      await writeFile(filePath, dataToStore, 'utf8');
      
      console.log(`Item stored securely: ${key}`);
    } catch (error) {
      console.error(`Failed to store item ${key}:`, error);
      throw error;
    }
  }

  async getItem<T>(key: string): Promise<T | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const filePath = join(this.storagePath, `${key}.dat`);
      let data = await readFile(filePath, 'utf8');
      
      // Decrypt if enabled
      if (this.config.encryptData) {
        data = await this.encryptionService.decrypt(data);
      }
      
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return null
        return null;
      }
      console.error(`Failed to retrieve item ${key}:`, error);
      return null;
    }
  }

  async removeItem(key: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const filePath = join(this.storagePath, `${key}.dat`);
      await unlink(filePath);
      
      console.log(`Item removed: ${key}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Failed to remove item ${key}:`, error);
        throw error;
      }
    }
  }

  async clear(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // In a real implementation, this would clear all secure storage
      // For now, we'll just log
      console.log('Secure storage cleared');
    } catch (error) {
      console.error('Failed to clear secure storage:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.encryptionService.close();
    console.log('Secure storage closed');
  }
}

export { SecureStorage };
```

## Security Settings UI

```typescript
// SecuritySettings.tsx
import React, { useContext } from 'react';
import { SettingsContext } from '../contexts/SettingsContext';

const SecuritySettings: React.FC = () => {
  const { settings, updateSettings } = useContext(SettingsContext);

  return (
    <div className="security-settings settings-section">
      <h3>Security Settings</h3>
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.privacy.encryptLocalStorage}
            onChange={(e) => updateSettings.set('privacy', { encryptLocalStorage: e.target.checked })}
          />
          Encrypt local storage
        </label>
        <div className="setting-description">
          Encrypt sensitive data stored locally on your device.
        </div>
      </div>
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.privacy.offlineOnlyMode}
            onChange={(e) => updateSettings.set('privacy', { offlineOnlyMode: e.target.checked })}
          />
          Offline-only mode
        </label>
        <div className="setting-description">
          Disable all internet connectivity. All processing will be done locally.
        </div>
      </div>
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.security.requireAuthentication}
            onChange={(e) => updateSettings.set('security', { requireAuthentication: e.target.checked })}
          />
          Require authentication
        </label>
        <div className="setting-description">
          Require authentication before accessing sensitive features.
        </div>
      </div>
      
      {settings.security.requireAuthentication && (
        <>
          <div className="setting-group">
            <label htmlFor="auth-timeout">
              Authentication timeout: {settings.security.authenticationTimeout} minutes
            </label>
            <input
              id="auth-timeout"
              type="range"
              min="1"
              max="120"
              value={settings.security.authenticationTimeout}
              onChange={(e) => updateSettings.set('security', { 
                authenticationTimeout: parseInt(e.target.value) 
              })}
            />
          </div>
          
          <div className="setting-group">
            <label>
              <input
                type="checkbox"
                checked={settings.security.enableBiometricAuth}
                onChange={(e) => updateSettings.set('security', { enableBiometricAuth: e.target.checked })}
              />
              Enable biometric authentication
            </label>
            <div className="setting-description">
              Use fingerprint or face recognition when available.
            </div>
          </div>
        </>
      )}
      
      <div className="setting-group">
        <button onClick={() => {
          // In a real implementation, this would trigger a master password setup
          console.log('Change master password');
        }}>
          Change Master Password
        </button>
        <div className="setting-description">
          Set or update the master password for encryption.
        </div>
      </div>
      
      <div className="setting-group">
        <button onClick={() => {
          // In a real implementation, this would show stored secrets
          console.log('View stored secrets');
        }}>
          View Stored Secrets
        </button>
        <div className="setting-description">
          Review and manage stored API keys and credentials.
        </div>
      </div>
    </div>
  );
};

export { SecuritySettings };
```

## Security Best Practices Implementation

### 1. Secure Communication

```typescript
// SecureIPC.ts
import { ipcMain, ipcRenderer } from 'electron';

class SecureIPC {
  static async sendSecure(channel: string, data: any): Promise<void> {
    // Encrypt data before sending
    const encryptedData = await this.encryptData(data);
    ipcRenderer.send(channel, encryptedData);
  }

  static async handleSecure(channel: string, handler: (data: any) => Promise<any>): Promise<void> {
    ipcMain.handle(channel, async (event, encryptedData) => {
      try {
        // Decrypt received data
        const data = await this.decryptData(encryptedData);
        const result = await handler(data);
        return await this.encryptData(result);
      } catch (error) {
        console.error('Secure IPC handling failed:', error);
        throw error;
      }
    });
  }

  private static async encryptData(data: any): Promise<string> {
    // In a real implementation, this would use the encryption service
    return JSON.stringify(data);
  }

  private static async decryptData(encryptedData: string): Promise<any> {
    // In a real implementation, this would use the encryption service
    return JSON.parse(encryptedData);
  }
}

export { SecureIPC };
```

### 2. Input Validation and Sanitization

```typescript
// InputValidator.ts
class InputValidator {
  static validateApiKey(apiKey: string): boolean {
    // Basic API key format validation
    return typeof apiKey === 'string' && 
           apiKey.length > 10 && 
           /^[a-zA-Z0-9-_]+$/.test(apiKey);
  }

  static validatePath(path: string): boolean {
    // Path validation to prevent directory traversal
    return typeof path === 'string' && 
           path.length > 0 && 
           !path.includes('../') && 
           !path.includes('..\\');
  }

  static sanitizeInput(input: string): string {
    // Remove potentially dangerous characters
    return input.replace(/[<>:"|?*]/g, '');
  }

  static validateCronExpression(expression: string): boolean {
    // Basic cron expression validation
    const parts = expression.split(' ');
    return parts.length === 5 && parts.every(part => /^[0-9*/,-]+$/.test(part));
  }
}

export { InputValidator };
```

### 3. Secure Error Handling

```typescript
// SecureError.ts
class SecureError extends Error {
  constructor(
    message: string,
    public code: string,
    public sensitiveData: boolean = false
  ) {
    super(message);
    this.name = 'SecureError';
  }

  toJSON(): string {
    // Don't include sensitive data in error serialization
    const errorObject = {
      name: this.name,
      message: this.sensitiveData ? 'An error occurred' : this.message,
      code: this.code
    };
    
    return JSON.stringify(errorObject);
  }
}

export { SecureError };
```

## Dependencies

```json
{
  "dependencies": {
    "keytar": "^7.9.0",
    "electron": "^25.0.0"
  }
}
```

## Cross-Platform Security Considerations

### 1. Credential Storage
- **macOS**: Keychain Services
- **Windows**: Windows Credential Vault
- **Linux**: libsecret (GNOME Keyring, KWallet)

### 2. File System Permissions
- Set appropriate file permissions for sensitive files
- Use platform-specific secure directories
- Validate file access permissions

### 3. Memory Security
- Clear sensitive data from memory after use
- Use secure memory allocation when possible
- Implement proper garbage collection

## Testing Strategy

### 1. Unit Tests
- Encryption/decryption functionality
- Secret storage and retrieval
- Input validation
- Secure error handling

### 2. Integration Tests
- End-to-end encryption workflows
- Credential storage across platforms
- Secure IPC communication
- Authentication flows

### 3. Security Audits
- Static code analysis for security issues
- Penetration testing
- Dependency vulnerability scanning
- Compliance verification

## Future Enhancements

### 1. Advanced Security Features
- Hardware security module (HSM) integration
- Multi-factor authentication
- Zero-knowledge architecture
- Secure enclave utilization (Touch ID, etc.)

### 2. Compliance Features
- GDPR compliance tools
- HIPAA compliance for medical data
- Audit logging
- Data retention policies

### 3. Performance Optimizations
- Hardware-accelerated encryption
- Efficient key management
- Caching strategies for encrypted data
- Secure memory pooling