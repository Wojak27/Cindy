import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Download, Github, ExternalLink, Monitor, Smartphone, Tablet, CheckCircle } from 'lucide-react';

const platforms = [
    {
        name: 'macOS',
        icon: Monitor,
        version: 'v1.0.0',
        size: '85 MB',
        downloadUrl: '#',
        requirements: 'macOS 10.15 or later'
    },
    {
        name: 'Windows',
        icon: Monitor,
        version: 'v1.0.0',
        size: '92 MB',
        downloadUrl: '#',
        requirements: 'Windows 10 or later'
    },
    {
        name: 'Linux',
        icon: Tablet,
        version: 'v1.0.0',
        size: '78 MB',
        downloadUrl: '#',
        requirements: 'Ubuntu 18.04+ or equivalent'
    }
];

const features = [
    'Completely free and open source',
    'No account registration required',
    'Works offline with local models',
    'Regular updates and improvements',
    'Active community support',
    'Privacy-focused design'
];

export default function DownloadSection() {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: "-100px" });

    return (
        <section id="download" ref={ref} className="py-20 bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.8 }}
                    className="text-center mb-16"
                >
                    <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
                        Download{' '}
                        <span className="bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">
                            Cindy
                        </span>
                    </h2>
                    <p className="text-xl text-gray-300 max-w-3xl mx-auto">
                        Get started with Cindy today. Free, open source, and available for all major platforms.
                    </p>
                </motion.div>

                {/* Platform Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                    {platforms.map((platform, index) => (
                        <motion.div
                            key={platform.name}
                            initial={{ opacity: 0, y: 30 }}
                            animate={isInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.6, delay: index * 0.1 }}
                            className="group"
                        >
                            <div className="relative p-8 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 hover:border-white/20 transition-all duration-300 hover:transform hover:scale-105 hover:shadow-2xl text-center">
                                {/* Platform Icon */}
                                <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                    <platform.icon className="w-8 h-8 text-white" />
                                </div>

                                {/* Platform Name */}
                                <h3 className="text-2xl font-semibold text-white mb-2">
                                    {platform.name}
                                </h3>
                                
                                {/* Version & Size */}
                                <div className="text-sm text-gray-400 mb-2">
                                    {platform.version} • {platform.size}
                                </div>
                                
                                {/* Requirements */}
                                <div className="text-xs text-gray-500 mb-6">
                                    {platform.requirements}
                                </div>

                                {/* Download Button */}
                                <button 
                                    onClick={() => window.open(platform.downloadUrl, '_blank')}
                                    className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white px-6 py-3 rounded-full font-semibold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 inline-flex items-center justify-center gap-2"
                                >
                                    <Download size={18} />
                                    Download
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Features List */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.8, delay: 0.4 }}
                    className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8 mb-16"
                >
                    <h3 className="text-2xl font-semibold text-white mb-8 text-center">
                        What You Get
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {features.map((feature, index) => (
                            <motion.div
                                key={feature}
                                initial={{ opacity: 0, x: -20 }}
                                animate={isInView ? { opacity: 1, x: 0 } : {}}
                                transition={{ duration: 0.5, delay: 0.6 + index * 0.1 }}
                                className="flex items-center gap-3 text-gray-300"
                            >
                                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                                <span>{feature}</span>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>

                {/* Open Source Section */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.8, delay: 0.8 }}
                    className="text-center"
                >
                    <div className="bg-gradient-to-r from-primary-500/10 to-secondary-500/10 backdrop-blur-sm rounded-2xl border border-white/10 p-8">
                        <Github className="w-12 h-12 mx-auto text-white mb-4" />
                        <h3 className="text-2xl font-semibold text-white mb-4">
                            100% Open Source
                        </h3>
                        <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
                            Cindy is completely open source and free forever. View the source code, 
                            contribute to development, or build your own version.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <button 
                                onClick={() => window.open('https://github.com/your-repo/cindy', '_blank')}
                                className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-full font-semibold transition-all duration-300 inline-flex items-center justify-center gap-2"
                            >
                                <Github size={18} />
                                View Source Code
                            </button>
                            <button 
                                onClick={() => window.open('https://github.com/your-repo/cindy/blob/main/CONTRIBUTING.md', '_blank')}
                                className="border-2 border-white/30 hover:border-white/50 text-white hover:bg-white/10 px-6 py-3 rounded-full font-semibold transition-all duration-300 backdrop-blur-sm inline-flex items-center justify-center gap-2"
                            >
                                <ExternalLink size={18} />
                                Contribute
                            </button>
                        </div>
                    </div>
                </motion.div>

                {/* Installation Note */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.8, delay: 1.0 }}
                    className="text-center mt-12"
                >
                    <p className="text-gray-400 text-sm">
                        💡 <strong>First time setup:</strong> Cindy will guide you through installing local models and configuring your preferences on first launch.
                    </p>
                </motion.div>
            </div>
        </section>
    );
}