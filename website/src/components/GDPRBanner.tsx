import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, ExternalLink } from 'lucide-react';

export default function GDPRBanner() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Check if user has already accepted/dismissed the banner
        const hasAccepted = localStorage.getItem('cindy-gdpr-accepted');
        if (!hasAccepted) {
            // Show banner after a short delay
            const timer = setTimeout(() => setIsVisible(true), 2000);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleAccept = () => {
        localStorage.setItem('cindy-gdpr-accepted', 'true');
        setIsVisible(false);
    };

    const handleDecline = () => {
        localStorage.setItem('cindy-gdpr-accepted', 'declined');
        setIsVisible(false);
    };

    const handleDismiss = () => {
        setIsVisible(false);
        // Set a temporary dismissal (will show again on next visit)
        sessionStorage.setItem('cindy-gdpr-dismissed', 'true');
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100]"
                        onClick={handleDismiss}
                    />
                    
                    {/* Banner */}
                    <motion.div
                        initial={{ opacity: 0, y: 100, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 100, scale: 0.9 }}
                        transition={{ 
                            type: "spring", 
                            stiffness: 300, 
                            damping: 30 
                        }}
                        className="fixed bottom-6 left-6 right-6 md:left-auto md:right-6 md:max-w-md lg:max-w-lg xl:max-w-xl z-[101]"
                    >
                        <div className="bg-slate-800/95 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl p-6">
                            {/* Header */}
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-full flex items-center justify-center flex-shrink-0">
                                        <Shield className="w-4 h-4 text-white" />
                                    </div>
                                    <h3 className="text-white font-semibold text-lg">Privacy & Cookies</h3>
                                </div>
                                
                                <button
                                    onClick={handleDismiss}
                                    className="text-gray-400 hover:text-white transition-colors p-1"
                                    aria-label="Dismiss banner"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="space-y-4">
                                <p className="text-gray-300 text-sm leading-relaxed">
                                    We respect your privacy! This website uses minimal cookies only for essential functionality. 
                                    Since Cindy runs locally on your device, no personal data is collected or transmitted to external servers.
                                </p>

                                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                                    <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded-full">
                                        🔒 Privacy-First
                                    </span>
                                    <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full">
                                        💾 Local Processing
                                    </span>
                                    <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full">
                                        🚫 No Tracking
                                    </span>
                                </div>

                                {/* Links */}
                                <div className="flex items-center gap-4 text-xs">
                                    <a 
                                        href="/privacy" 
                                        className="text-primary-400 hover:text-primary-300 transition-colors inline-flex items-center gap-1"
                                    >
                                        Privacy Policy <ExternalLink size={12} />
                                    </a>
                                    <a 
                                        href="/cookies" 
                                        className="text-primary-400 hover:text-primary-300 transition-colors inline-flex items-center gap-1"
                                    >
                                        Cookie Policy <ExternalLink size={12} />
                                    </a>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col sm:flex-row gap-3 mt-6">
                                <button
                                    onClick={handleAccept}
                                    className="flex-1 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 shadow-lg hover:shadow-xl"
                                >
                                    Accept & Continue
                                </button>
                                <button
                                    onClick={handleDecline}
                                    className="flex-1 border border-white/30 hover:border-white/50 text-white hover:bg-white/10 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 backdrop-blur-sm"
                                >
                                    Decline
                                </button>
                            </div>

                            {/* Legal Note */}
                            <p className="text-xs text-gray-500 mt-4 text-center">
                                By using this website, you agree to our use of essential cookies for functionality. 
                                Your data remains on your device at all times.
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}