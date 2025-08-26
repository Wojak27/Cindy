import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    Button,
    TextField,
    IconButton,
    Alert,
    CircularProgress,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    ListItemSecondaryAction,
    Divider,
    Accordion,
    AccordionSummary,
    AccordionDetails,
} from '@mui/material';
import {
    Email as EmailIcon,
    LibraryBooks as LibraryIcon,
    Link as LinkIcon,
    LinkOff as LinkOffIcon,
    Check as CheckIcon,
    Error as ErrorIcon,
    Refresh as RefreshIcon,
    Settings as SettingsIcon,
    ExpandMore as ExpandMoreIcon,
    Key as KeyIcon,
    Save as SaveIcon,
} from '@mui/icons-material';
import { ipcRenderer } from 'electron';

interface ConnectorStatus {
    enabled: boolean;
    connected: boolean;
    userInfo?: {
        email?: string;
        name?: string;
        id?: string;
    };
    lastSync?: string;
}

interface OAuthConfig {
    gmail?: {
        clientId: string;
        clientSecret: string;
    };
    outlook?: {
        clientId: string;
        clientSecret: string;
    };
    mendeley?: {
        clientId: string;
        clientSecret: string;
    };
}

interface ConnectorIntegrationsProps {
    onSettingsChange?: (hasChanges: boolean) => void;
}

const ConnectorIntegrations: React.FC<ConnectorIntegrationsProps> = ({ onSettingsChange }) => {
    const [connectorStatus, setConnectorStatus] = useState<Record<string, ConnectorStatus>>({});
    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string>('');
    const [success, setSuccess] = useState<string>('');
    
    // OAuth configuration
    const [oauthConfig, setOAuthConfig] = useState<OAuthConfig>({});
    const [oauthExpanded, setOAuthExpanded] = useState(false);
    
    // Zotero configuration dialog
    const [zoteroDialog, setZoteroDialog] = useState(false);
    const [zoteroApiKey, setZoteroApiKey] = useState('');
    const [zoteroUserId, setZoteroUserId] = useState('');
    const [zoteroWorkspaceId, setZoteroWorkspaceId] = useState('');

    // Load connector status and OAuth config on mount
    useEffect(() => {
        loadConnectorStatus();
        loadOAuthConfig();
    }, []);

    const loadConnectorStatus = async () => {
        try {
            const result = await ipcRenderer.invoke('connector-get-status');
            if (result.success) {
                setConnectorStatus(result.data);
            } else {
                setError(result.error || 'Failed to load connector status');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load connector status');
        }
    };

    const loadOAuthConfig = async () => {
        try {
            // Load OAuth credentials securely
            const [gmailCreds, outlookCreds, mendeleyCreds] = await Promise.all([
                ipcRenderer.invoke('settings-get-oauth-credentials', 'gmail'),
                ipcRenderer.invoke('settings-get-oauth-credentials', 'outlook'),
                ipcRenderer.invoke('settings-get-oauth-credentials', 'mendeley')
            ]);
            
            const config: OAuthConfig = {};
            if (gmailCreds) config.gmail = gmailCreds;
            if (outlookCreds) config.outlook = outlookCreds;
            if (mendeleyCreds) config.mendeley = mendeleyCreds;
            
            setOAuthConfig(config);
        } catch (err: any) {
            console.error('Failed to load OAuth config:', err);
        }
    };

    const saveOAuthConfig = async () => {
        try {
            // Save OAuth credentials securely via dedicated methods
            const promises = [];
            
            if (oauthConfig.gmail?.clientId && oauthConfig.gmail?.clientSecret) {
                promises.push(
                    ipcRenderer.invoke('settings-set-oauth-credentials', 'gmail', 
                        oauthConfig.gmail.clientId, oauthConfig.gmail.clientSecret)
                );
            }
            
            if (oauthConfig.outlook?.clientId && oauthConfig.outlook?.clientSecret) {
                promises.push(
                    ipcRenderer.invoke('settings-set-oauth-credentials', 'outlook', 
                        oauthConfig.outlook.clientId, oauthConfig.outlook.clientSecret)
                );
            }
            
            if (oauthConfig.mendeley?.clientId && oauthConfig.mendeley?.clientSecret) {
                promises.push(
                    ipcRenderer.invoke('settings-set-oauth-credentials', 'mendeley', 
                        oauthConfig.mendeley.clientId, oauthConfig.mendeley.clientSecret)
                );
            }
            
            await Promise.all(promises);
            setSuccess('OAuth configuration saved securely!');
            
            if (onSettingsChange) {
                onSettingsChange(false);
            }
        } catch (err: any) {
            setError('Failed to save OAuth configuration: ' + err.message);
        }
    };

    const handleConnect = async (provider: string) => {
        // Check if OAuth credentials are configured
        if (provider === 'gmail' && (!oauthConfig.gmail?.clientId || !oauthConfig.gmail?.clientSecret)) {
            setError('Please configure Gmail OAuth credentials first (expand OAuth Configuration below)');
            setOAuthExpanded(true);
            return;
        }
        if (provider === 'outlook' && (!oauthConfig.outlook?.clientId || !oauthConfig.outlook?.clientSecret)) {
            setError('Please configure Outlook OAuth credentials first (expand OAuth Configuration below)');
            setOAuthExpanded(true);
            return;
        }
        if (provider === 'mendeley' && (!oauthConfig.mendeley?.clientId || !oauthConfig.mendeley?.clientSecret)) {
            setError('Please configure Mendeley OAuth credentials first (expand OAuth Configuration below)');
            setOAuthExpanded(true);
            return;
        }

        setLoading({ ...loading, [provider]: true });
        setError('');
        setSuccess('');

        try {
            if (provider === 'zotero') {
                // Show Zotero configuration dialog
                setZoteroDialog(true);
                setLoading({ ...loading, [provider]: false });
                return;
            }

            // Pass OAuth config with the request
            const result = await ipcRenderer.invoke('connector-start-oauth', provider, oauthConfig[provider as keyof OAuthConfig]);
            
            if (result.success && result.data?.authUrl) {
                // Open OAuth URL in default browser
                await ipcRenderer.invoke('shell-open-external', result.data.authUrl);
                setSuccess(`Please complete authentication in your browser for ${provider}`);
                
                // Poll for status updates
                const pollInterval = setInterval(async () => {
                    const statusResult = await ipcRenderer.invoke('connector-get-status');
                    if (statusResult.success) {
                        const newStatus = statusResult.data[provider];
                        if (newStatus?.connected) {
                            clearInterval(pollInterval);
                            setConnectorStatus(statusResult.data);
                            setSuccess(`Successfully connected to ${provider}!`);
                            setLoading({ ...loading, [provider]: false });
                        }
                    }
                }, 2000);

                // Stop polling after 2 minutes
                setTimeout(() => {
                    clearInterval(pollInterval);
                    setLoading({ ...loading, [provider]: false });
                }, 120000);
            } else {
                setError(result.error || `Failed to start OAuth for ${provider}`);
                setLoading({ ...loading, [provider]: false });
            }
        } catch (err: any) {
            setError(err.message || `Failed to connect ${provider}`);
            setLoading({ ...loading, [provider]: false });
        }
    };

    const handleDisconnect = async (provider: string) => {
        setLoading({ ...loading, [provider]: true });
        setError('');
        setSuccess('');

        try {
            const result = await ipcRenderer.invoke('connector-disconnect', provider);
            
            if (result.success) {
                await loadConnectorStatus();
                setSuccess(`Successfully disconnected from ${provider}`);
            } else {
                setError(result.error || `Failed to disconnect ${provider}`);
            }
        } catch (err: any) {
            setError(err.message || `Failed to disconnect ${provider}`);
        } finally {
            setLoading({ ...loading, [provider]: false });
        }
    };

    const handleTest = async (provider: string) => {
        setLoading({ ...loading, [`${provider}_test`]: true });
        setError('');
        setSuccess('');

        try {
            const result = await ipcRenderer.invoke('connector-test', provider);
            
            if (result.success) {
                setSuccess(result.message || `${provider} is working correctly!`);
            } else {
                setError(result.message || `${provider} test failed`);
            }
        } catch (err: any) {
            setError(err.message || `Failed to test ${provider}`);
        } finally {
            setLoading({ ...loading, [`${provider}_test`]: false });
        }
    };

    const handleZoteroSave = async () => {
        if (!zoteroApiKey || !zoteroUserId) {
            setError('Please provide both API key and User ID for Zotero');
            return;
        }

        setLoading({ ...loading, zotero: true });
        setError('');

        try {
            const result = await ipcRenderer.invoke(
                'connector-configure-zotero',
                zoteroApiKey,
                zoteroUserId,
                zoteroWorkspaceId || undefined
            );

            if (result.success) {
                await loadConnectorStatus();
                setSuccess('Successfully connected to Zotero!');
                setZoteroDialog(false);
                setZoteroApiKey('');
                setZoteroUserId('');
                setZoteroWorkspaceId('');
            } else {
                setError(result.error || 'Failed to configure Zotero');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to configure Zotero');
        } finally {
            setLoading({ ...loading, zotero: false });
        }
    };

    const handleOAuthConfigChange = (provider: keyof OAuthConfig, field: 'clientId' | 'clientSecret', value: string) => {
        setOAuthConfig(prev => ({
            ...prev,
            [provider]: {
                ...prev[provider],
                [field]: value
            }
        }));
        if (onSettingsChange) {
            onSettingsChange(true);
        }
    };

    const getConnectorName = (provider: string) => {
        switch (provider) {
            case 'gmail': return 'Gmail';
            case 'outlook': return 'Outlook';
            case 'zotero': return 'Zotero';
            case 'mendeley': return 'Mendeley';
            default: return provider;
        }
    };

    return (
        <Box>
            <Typography variant="h6" gutterBottom fontWeight={600}>
                Email & Reference Connectors
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Connect your email accounts and reference managers to search and retrieve information directly through the AI assistant.
            </Typography>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            {success && (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
                    {success}
                </Alert>
            )}

            {/* OAuth Configuration */}
            <Accordion expanded={oauthExpanded} onChange={(_, expanded) => setOAuthExpanded(expanded)} sx={{ mb: 3 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <KeyIcon />
                        <Typography fontWeight={600}>OAuth Configuration</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                            (Required for Gmail, Outlook, and Mendeley)
                        </Typography>
                    </Box>
                </AccordionSummary>
                <AccordionDetails>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        To use OAuth connectors, you need to register your application with each provider and obtain client credentials.
                    </Alert>
                    
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                            Gmail (Google)
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                            Get credentials from: console.cloud.google.com → APIs & Services → Credentials
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                            <TextField
                                size="small"
                                fullWidth
                                label="Client ID"
                                value={oauthConfig.gmail?.clientId || ''}
                                onChange={(e) => handleOAuthConfigChange('gmail', 'clientId', e.target.value)}
                                type="password"
                            />
                            <TextField
                                size="small"
                                fullWidth
                                label="Client Secret"
                                value={oauthConfig.gmail?.clientSecret || ''}
                                onChange={(e) => handleOAuthConfigChange('gmail', 'clientSecret', e.target.value)}
                                type="password"
                            />
                        </Box>
                    </Box>

                    <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                            Outlook (Microsoft)
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                            Get credentials from: portal.azure.com → App registrations
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                            <TextField
                                size="small"
                                fullWidth
                                label="Client ID"
                                value={oauthConfig.outlook?.clientId || ''}
                                onChange={(e) => handleOAuthConfigChange('outlook', 'clientId', e.target.value)}
                                type="password"
                            />
                            <TextField
                                size="small"
                                fullWidth
                                label="Client Secret"
                                value={oauthConfig.outlook?.clientSecret || ''}
                                onChange={(e) => handleOAuthConfigChange('outlook', 'clientSecret', e.target.value)}
                                type="password"
                            />
                        </Box>
                    </Box>

                    <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                            Mendeley
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                            Get credentials from: dev.mendeley.com → My Apps
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                            <TextField
                                size="small"
                                fullWidth
                                label="Client ID"
                                value={oauthConfig.mendeley?.clientId || ''}
                                onChange={(e) => handleOAuthConfigChange('mendeley', 'clientId', e.target.value)}
                                type="password"
                            />
                            <TextField
                                size="small"
                                fullWidth
                                label="Client Secret"
                                value={oauthConfig.mendeley?.clientSecret || ''}
                                onChange={(e) => handleOAuthConfigChange('mendeley', 'clientSecret', e.target.value)}
                                type="password"
                            />
                        </Box>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button variant="contained" onClick={saveOAuthConfig} startIcon={<SaveIcon />}>
                            Save OAuth Configuration
                        </Button>
                    </Box>
                </AccordionDetails>
            </Accordion>

            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Typography variant="subtitle1" gutterBottom fontWeight={600}>
                        Email Connectors
                    </Typography>
                    <List>
                        {['gmail', 'outlook'].map(provider => {
                            const status = connectorStatus[provider];
                            const isLoading = loading[provider];
                            const isTestLoading = loading[`${provider}_test`];
                            
                            return (
                                <React.Fragment key={provider}>
                                    <ListItem>
                                        <ListItemIcon>
                                            <EmailIcon />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    {getConnectorName(provider)}
                                                    {status?.connected && (
                                                        <Chip
                                                            size="small"
                                                            label="Connected"
                                                            color="success"
                                                            icon={<CheckIcon />}
                                                        />
                                                    )}
                                                </Box>
                                            }
                                            secondary={
                                                status?.connected && status?.userInfo?.email
                                                    ? `Connected as ${status.userInfo.email}`
                                                    : 'Not connected'
                                            }
                                        />
                                        <ListItemSecondaryAction>
                                            {status?.connected ? (
                                                <Box sx={{ display: 'flex', gap: 1 }}>
                                                    <Button
                                                        size="small"
                                                        onClick={() => handleTest(provider)}
                                                        disabled={isTestLoading}
                                                        startIcon={isTestLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
                                                    >
                                                        Test
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        color="error"
                                                        onClick={() => handleDisconnect(provider)}
                                                        disabled={isLoading}
                                                        startIcon={isLoading ? <CircularProgress size={16} /> : <LinkOffIcon />}
                                                    >
                                                        Disconnect
                                                    </Button>
                                                </Box>
                                            ) : (
                                                <Button
                                                    size="small"
                                                    variant="contained"
                                                    onClick={() => handleConnect(provider)}
                                                    disabled={isLoading}
                                                    startIcon={isLoading ? <CircularProgress size={16} /> : <LinkIcon />}
                                                >
                                                    Connect
                                                </Button>
                                            )}
                                        </ListItemSecondaryAction>
                                    </ListItem>
                                    <Divider />
                                </React.Fragment>
                            );
                        })}
                    </List>
                </CardContent>
            </Card>

            <Card>
                <CardContent>
                    <Typography variant="subtitle1" gutterBottom fontWeight={600}>
                        Reference Managers
                    </Typography>
                    <List>
                        {['zotero', 'mendeley'].map(provider => {
                            const status = connectorStatus[provider];
                            const isLoading = loading[provider];
                            const isTestLoading = loading[`${provider}_test`];
                            
                            return (
                                <React.Fragment key={provider}>
                                    <ListItem>
                                        <ListItemIcon>
                                            <LibraryIcon />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    {getConnectorName(provider)}
                                                    {status?.connected && (
                                                        <Chip
                                                            size="small"
                                                            label="Connected"
                                                            color="success"
                                                            icon={<CheckIcon />}
                                                        />
                                                    )}
                                                </Box>
                                            }
                                            secondary={
                                                status?.connected && status?.userInfo?.name
                                                    ? `Connected as ${status.userInfo.name}`
                                                    : provider === 'zotero' 
                                                        ? 'Requires API key and User ID'
                                                        : 'Not connected'
                                            }
                                        />
                                        <ListItemSecondaryAction>
                                            {status?.connected ? (
                                                <Box sx={{ display: 'flex', gap: 1 }}>
                                                    <Button
                                                        size="small"
                                                        onClick={() => handleTest(provider)}
                                                        disabled={isTestLoading}
                                                        startIcon={isTestLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
                                                    >
                                                        Test
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        color="error"
                                                        onClick={() => handleDisconnect(provider)}
                                                        disabled={isLoading}
                                                        startIcon={isLoading ? <CircularProgress size={16} /> : <LinkOffIcon />}
                                                    >
                                                        Disconnect
                                                    </Button>
                                                </Box>
                                            ) : (
                                                <Button
                                                    size="small"
                                                    variant="contained"
                                                    onClick={() => handleConnect(provider)}
                                                    disabled={isLoading}
                                                    startIcon={isLoading ? <CircularProgress size={16} /> : <LinkIcon />}
                                                >
                                                    {provider === 'zotero' ? 'Configure' : 'Connect'}
                                                </Button>
                                            )}
                                        </ListItemSecondaryAction>
                                    </ListItem>
                                    {provider !== 'mendeley' && <Divider />}
                                </React.Fragment>
                            );
                        })}
                    </List>
                </CardContent>
            </Card>

            {/* Zotero Configuration Dialog */}
            <Dialog open={zoteroDialog} onClose={() => setZoteroDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Configure Zotero</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        To connect Zotero, you need to provide your API key and User ID from your Zotero account settings.
                    </Typography>
                    <TextField
                        fullWidth
                        label="API Key"
                        type="password"
                        value={zoteroApiKey}
                        onChange={(e) => setZoteroApiKey(e.target.value)}
                        sx={{ mb: 2 }}
                        helperText="Get your API key from zotero.org/settings/keys"
                    />
                    <TextField
                        fullWidth
                        label="User ID"
                        value={zoteroUserId}
                        onChange={(e) => setZoteroUserId(e.target.value)}
                        sx={{ mb: 2 }}
                        helperText="Find your User ID at zotero.org/settings/keys"
                    />
                    <TextField
                        fullWidth
                        label="Workspace ID (Optional)"
                        value={zoteroWorkspaceId}
                        onChange={(e) => setZoteroWorkspaceId(e.target.value)}
                        helperText="For group libraries only"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setZoteroDialog(false)}>Cancel</Button>
                    <Button 
                        onClick={handleZoteroSave} 
                        variant="contained" 
                        disabled={loading.zotero || !zoteroApiKey || !zoteroUserId}
                    >
                        {loading.zotero ? <CircularProgress size={20} /> : 'Connect'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ConnectorIntegrations;