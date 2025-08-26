import { useState, useEffect } from 'react';
import { Download, Menu, X, Github } from 'lucide-react';

export default function Navigation() {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50);
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollToSection = (id: string) => {
        const element = document.getElementById(id);
        element?.scrollIntoView({ behavior: 'smooth' });
        setIsMobileMenuOpen(false);
    };

    return (
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
            isScrolled 
                ? 'bg-white/10 backdrop-blur-md border-b border-white/20' 
                : 'bg-transparent'
        }`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <div className="flex-shrink-0">
                        <h1 className="text-2xl font-bold text-white">Cindy</h1>
                    </div>

                    {/* Desktop Navigation */}
                    <div className="hidden md:block">
                        <div className="ml-10 flex items-baseline space-x-4">
                            <button
                                onClick={() => scrollToSection('features')}
                                className="text-white hover:text-primary-300 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                            >
                                Features
                            </button>
                            <button
                                onClick={() => scrollToSection('how-it-works')}
                                className="text-white hover:text-primary-300 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                            >
                                How It Works
                            </button>
                            <button
                                onClick={() => scrollToSection('download')}
                                className="text-white hover:text-primary-300 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                            >
                                Download
                            </button>
                            <a
                                href="https://github.com/your-repo/cindy"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-white hover:text-primary-300 px-3 py-2 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2"
                            >
                                <Github size={16} />
                                GitHub
                            </a>
                        </div>
                    </div>

                    {/* Download Button */}
                    <div className="hidden md:block">
                        <button
                            onClick={() => scrollToSection('download')}
                            className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-full text-sm font-medium transition-colors inline-flex items-center gap-2 shadow-lg hover:shadow-xl"
                        >
                            <Download size={16} />
                            Download
                        </button>
                    </div>

                    {/* Mobile menu button */}
                    <div className="md:hidden">
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="text-white hover:text-primary-300 transition-colors"
                        >
                            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            {isMobileMenuOpen && (
                <div className="md:hidden bg-black/95 backdrop-blur-md border-t border-white/10">
                    <div className="px-4 pt-4 pb-6 space-y-3">
                        <button
                            onClick={() => scrollToSection('features')}
                            className="text-white hover:text-primary-300 block px-3 py-2 rounded-md text-base font-medium transition-colors w-full text-left"
                        >
                            Features
                        </button>
                        <button
                            onClick={() => scrollToSection('how-it-works')}
                            className="text-white hover:text-primary-300 block px-3 py-2 rounded-md text-base font-medium transition-colors w-full text-left"
                        >
                            How It Works
                        </button>
                        <button
                            onClick={() => scrollToSection('download')}
                            className="text-white hover:text-primary-300 block px-3 py-2 rounded-md text-base font-medium transition-colors w-full text-left"
                        >
                            Download
                        </button>
                        <a
                            href="https://github.com/your-repo/cindy"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white hover:text-primary-300 block px-3 py-2 rounded-md text-base font-medium transition-colors inline-flex items-center gap-2"
                        >
                            <Github size={16} />
                            GitHub
                        </a>
                        <button
                            onClick={() => scrollToSection('download')}
                            className="bg-primary-600 hover:bg-primary-700 text-white mx-3 mt-4 px-6 py-3 rounded-full font-medium transition-colors inline-flex items-center justify-center gap-2 shadow-lg w-full max-w-xs"
                        >
                            <Download size={18} />
                            Download Cindy
                        </button>
                    </div>
                </div>
            )}
        </nav>
    );
}