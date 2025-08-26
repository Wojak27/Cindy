import { motion } from 'framer-motion';
import { Mic, Brain, Zap } from 'lucide-react';

interface HeroSectionProps {
    hideBlob?: boolean;
}

export default function HeroSection({ hideBlob = false }: HeroSectionProps) {
    const scrollToFeatures = () => {
        const element = document.getElementById('features');
        element?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            {/* Background Effects */}
            <div className="absolute inset-0">
                {/* Animated background blobs */}
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/20 rounded-full filter blur-3xl animate-blob opacity-70"></div>
                <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-secondary-500/20 rounded-full filter blur-3xl animate-blob animation-delay-2000 opacity-70"></div>
                <div className="absolute bottom-1/4 left-1/2 w-96 h-96 bg-primary-600/20 rounded-full filter blur-3xl animate-blob animation-delay-4000 opacity-70"></div>
            </div>

            {/* Main Content */}
            <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    {/* Text Content */}
                    <div className="space-y-8">
                        <motion.h1
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className="text-5xl md:text-7xl font-bold text-white leading-tight"
                        >
                            Meet{' '}
                            <span className="bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">
                                Cindy
                            </span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.4 }}
                            className="text-xl md:text-2xl text-gray-300 max-w-2xl mx-auto lg:mx-0"
                        >
                            Your AI-powered voice assistant that understands, remembers, and evolves with you. 
                            Experience the future of human-computer interaction.
                        </motion.p>

                        {/* Feature Pills */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.6 }}
                            className="flex flex-wrap justify-center lg:justify-start gap-4"
                        >
                            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 text-white">
                                <Mic size={16} className="text-primary-400" />
                                <span className="text-sm font-medium">Voice Activated</span>
                            </div>
                            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 text-white">
                                <Brain size={16} className="text-secondary-400" />
                                <span className="text-sm font-medium">AI Memory</span>
                            </div>
                            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 text-white">
                                <Zap size={16} className="text-primary-400" />
                                <span className="text-sm font-medium">Local Processing</span>
                            </div>
                        </motion.div>

                        {/* CTA Buttons */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.8 }}
                            className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
                        >
                            <button
                                onClick={scrollToFeatures}
                                className="bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                            >
                                Explore Features
                            </button>
                            <button
                                onClick={() => document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' })}
                                className="border-2 border-white/30 hover:border-white/50 text-white hover:bg-white/10 px-8 py-4 rounded-full text-lg font-semibold transition-all duration-300 backdrop-blur-sm"
                            >
                                Download Now
                            </button>
                        </motion.div>
                    </div>

                    {/* Blob Area - The blob is positioned globally but we need space for floating elements */}
                    <div className="relative lg:flex lg:items-center lg:justify-center">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 1, delay: 0.5 }}
                            className="relative w-96 h-96 flex items-center justify-center"
                        >
                            {/* Floating Elements that orbit around the blob space */}
                            <motion.div
                                animate={{ 
                                    rotate: 360,
                                    y: [0, -20, 0]
                                }}
                                transition={{ 
                                    rotate: { duration: 20, repeat: Infinity, ease: "linear" },
                                    y: { duration: 4, repeat: Infinity, ease: "easeInOut" }
                                }}
                                className="absolute -top-8 -right-8 w-16 h-16 bg-gradient-to-br from-primary-400 to-secondary-400 rounded-full flex items-center justify-center shadow-lg"
                            >
                                <Mic className="text-white" size={24} />
                            </motion.div>

                            <motion.div
                                animate={{ 
                                    rotate: -360,
                                    y: [0, 15, 0]
                                }}
                                transition={{ 
                                    rotate: { duration: 15, repeat: Infinity, ease: "linear" },
                                    y: { duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }
                                }}
                                className="absolute -bottom-8 -left-8 w-12 h-12 bg-gradient-to-br from-secondary-400 to-primary-400 rounded-full flex items-center justify-center shadow-lg"
                            >
                                <Brain className="text-white" size={18} />
                            </motion.div>

                            <motion.div
                                animate={{ 
                                    rotate: 360,
                                    x: [0, 25, 0]
                                }}
                                transition={{ 
                                    rotate: { duration: 25, repeat: Infinity, ease: "linear" },
                                    x: { duration: 5, repeat: Infinity, ease: "easeInOut", delay: 2 }
                                }}
                                className="absolute top-1/2 -left-12 w-10 h-10 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-full flex items-center justify-center shadow-lg"
                            >
                                <Zap className="text-white" size={16} />
                            </motion.div>

                            {/* Add more floating elements for visual balance */}
                            <motion.div
                                animate={{ 
                                    rotate: -360,
                                    y: [0, 10, 0],
                                    x: [0, -15, 0]
                                }}
                                transition={{ 
                                    rotate: { duration: 18, repeat: Infinity, ease: "linear" },
                                    y: { duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 },
                                    x: { duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 1.5 }
                                }}
                                className="absolute top-8 left-8 w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full opacity-80"
                            />

                            <motion.div
                                animate={{ 
                                    rotate: 360,
                                    y: [0, -12, 0],
                                    x: [0, 18, 0]
                                }}
                                transition={{ 
                                    rotate: { duration: 22, repeat: Infinity, ease: "linear" },
                                    y: { duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: 1.8 },
                                    x: { duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 0.8 }
                                }}
                                className="absolute bottom-16 right-16 w-6 h-6 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full opacity-70"
                            />
                        </motion.div>
                    </div>
                </div>

                {/* Scroll Indicator */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.5 }}
                    className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
                >
                    <motion.div
                        animate={{ y: [0, 10, 0] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center"
                    >
                        <motion.div
                            animate={{ y: [0, 12, 0] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="w-1 h-3 bg-white/60 rounded-full mt-2"
                        />
                    </motion.div>
                </motion.div>
            </div>
        </section>
    );
}