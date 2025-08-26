import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import Navigation from './components/Navigation';
import HeroSection from './components/HeroSection';
import FeaturesSection from './components/FeaturesSection';
import HowItWorksSection from './components/HowItWorksSection';
import DownloadSection from './components/DownloadSection';
import SoundReactiveBlob from './components/SoundReactiveBlob';

export default function App() {
    const [scrollY, setScrollY] = useState(0);
    const [isFloating, setIsFloating] = useState(false);
    const heroRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            setScrollY(currentScrollY);
            
            // Trigger floating when scrolled past 70% of viewport height
            setIsFloating(currentScrollY > window.innerHeight * 0.7);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div className="min-h-screen bg-slate-900 text-white">
            {/* Navigation */}
            <Navigation />
            
            {/* Single Blob that transitions from center to floating */}
            <motion.div
                className="fixed pointer-events-none z-40"
                animate={{
                    x: isFloating ? window.innerWidth - 200 : window.innerWidth / 2 - 175,
                    y: isFloating ? 80 : window.innerHeight / 2 - 175,
                    scale: isFloating ? 0.4 : 1,
                    opacity: isFloating ? 0.7 : 1
                }}
                transition={{ 
                    duration: 1.2, 
                    ease: [0.4, 0.0, 0.2, 1],
                    type: "spring",
                    stiffness: 100,
                    damping: 20
                }}
                style={{
                    filter: isFloating ? 'blur(0.5px)' : 'none',
                }}
            >
                <SoundReactiveBlob 
                    isActive={true} 
                    size={350}
                />
            </motion.div>

            {/* Main Content */}
            <main>
                <HeroSection hideBlob={true} />
                <FeaturesSection />
                <HowItWorksSection />
                <DownloadSection />
            </main>

            {/* Footer */}
            <footer className="bg-slate-900 border-t border-white/10 py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                        {/* Brand */}
                        <div className="md:col-span-2">
                            <h3 className="text-2xl font-bold text-white mb-4">Cindy</h3>
                            <p className="text-gray-400 mb-6 max-w-md">
                                Your AI-powered voice assistant that understands, remembers, and evolves with you. 
                                Experience the future of human-computer interaction with complete privacy.
                            </p>
                            <div className="flex gap-4">
                                <a 
                                    href="https://github.com/your-repo/cindy" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-gray-400 hover:text-white transition-colors"
                                >
                                    GitHub
                                </a>
                                <a 
                                    href="https://discord.gg/your-discord" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-gray-400 hover:text-white transition-colors"
                                >
                                    Discord
                                </a>
                                <a 
                                    href="https://twitter.com/your-twitter" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-gray-400 hover:text-white transition-colors"
                                >
                                    Twitter
                                </a>
                            </div>
                        </div>

                        {/* Quick Links */}
                        <div>
                            <h4 className="text-white font-semibold mb-4">Quick Links</h4>
                            <ul className="space-y-2">
                                <li><button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} className="text-gray-400 hover:text-white transition-colors">Features</button></li>
                                <li><button onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} className="text-gray-400 hover:text-white transition-colors">How It Works</button></li>
                                <li><button onClick={() => document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' })} className="text-gray-400 hover:text-white transition-colors">Download</button></li>
                                <li><a href="https://github.com/your-repo/cindy/blob/main/docs/README.md" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">Documentation</a></li>
                            </ul>
                        </div>

                        {/* Support */}
                        <div>
                            <h4 className="text-white font-semibold mb-4">Support</h4>
                            <ul className="space-y-2">
                                <li><a href="https://github.com/your-repo/cindy/issues" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">Report Issues</a></li>
                                <li><a href="https://github.com/your-repo/cindy/discussions" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">Discussions</a></li>
                                <li><a href="https://github.com/your-repo/cindy/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">Contributing</a></li>
                                <li><a href="mailto:support@getcindy.app" className="text-gray-400 hover:text-white transition-colors">Contact</a></li>
                            </ul>
                        </div>
                    </div>

                    {/* Bottom Bar */}
                    <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center">
                        <p className="text-gray-400 text-sm">
                            © 2024 Cindy. Open source under MIT License.
                        </p>
                        <div className="flex gap-6 mt-4 md:mt-0">
                            <a href="/privacy" className="text-gray-400 hover:text-white text-sm transition-colors">Privacy Policy</a>
                            <a href="/terms" className="text-gray-400 hover:text-white text-sm transition-colors">Terms of Service</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}