import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Mic, Brain, Shield, Zap, MessageSquare, Search, Database, Headphones } from 'lucide-react';

const features = [
    {
        icon: Mic,
        title: 'Wake Word Detection',
        description: 'Always listening, always ready. Just say "Hey Cindy" and start your conversation naturally.',
        gradient: 'from-blue-500 to-cyan-500'
    },
    {
        icon: Brain,
        title: 'AI Memory',
        description: 'Cindy remembers your preferences, past conversations, and context to provide personalized responses.',
        gradient: 'from-purple-500 to-pink-500'
    },
    {
        icon: Shield,
        title: 'Privacy First',
        description: 'Your data stays on your device. No cloud processing, no data mining, complete privacy.',
        gradient: 'from-green-500 to-emerald-500'
    },
    {
        icon: Zap,
        title: 'Local LLMs',
        description: 'Powered by local language models like Ollama. Fast, private, and always available offline.',
        gradient: 'from-yellow-500 to-orange-500'
    },
    {
        icon: MessageSquare,
        title: 'Natural Conversations',
        description: 'Engage in fluid, context-aware conversations that feel natural and intuitive.',
        gradient: 'from-red-500 to-pink-500'
    },
    {
        icon: Search,
        title: 'Smart Research',
        description: 'Ask questions and get comprehensive research with sources, summaries, and insights.',
        gradient: 'from-indigo-500 to-blue-500'
    },
    {
        icon: Database,
        title: 'Knowledge Base',
        description: 'Index your documents and files for instant retrieval and contextual understanding.',
        gradient: 'from-teal-500 to-green-500'
    },
    {
        icon: Headphones,
        title: 'Text-to-Speech',
        description: 'High-quality voice synthesis that sounds natural and expressive.',
        gradient: 'from-violet-500 to-purple-500'
    }
];

export default function FeaturesSection() {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: "-100px" });

    return (
        <section id="features" ref={ref} className="py-20 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.8 }}
                    className="text-center mb-16"
                >
                    <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
                        Powerful{' '}
                        <span className="bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">
                            Features
                        </span>
                    </h2>
                    <p className="text-xl text-gray-300 max-w-3xl mx-auto">
                        Experience the next generation of AI assistance with features designed for privacy, 
                        intelligence, and seamless integration into your workflow.
                    </p>
                </motion.div>

                {/* Features Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
                    {features.map((feature, index) => (
                        <motion.div
                            key={feature.title}
                            initial={{ opacity: 0, y: 30 }}
                            animate={isInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.6, delay: index * 0.1 }}
                            className="group"
                        >
                            <div className="relative p-6 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 hover:border-white/20 transition-all duration-300 hover:transform hover:scale-105 hover:shadow-2xl">
                                {/* Background gradient on hover */}
                                <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity duration-300`} />
                                
                                {/* Icon */}
                                <div className={`relative w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} p-3 mb-4 group-hover:scale-110 transition-transform duration-300`}>
                                    <feature.icon className="w-full h-full text-white" />
                                </div>

                                {/* Content */}
                                <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-primary-400 group-hover:to-secondary-400 group-hover:bg-clip-text transition-all duration-300">
                                    {feature.title}
                                </h3>
                                <p className="text-gray-400 group-hover:text-gray-300 transition-colors duration-300">
                                    {feature.description}
                                </p>

                                {/* Hover effects */}
                                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary-500/10 to-secondary-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Bottom CTA */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.8, delay: 0.8 }}
                    className="text-center mt-16"
                >
                    <p className="text-lg text-gray-300 mb-8">
                        Ready to experience the future of AI assistance?
                    </p>
                    <button
                        onClick={() => document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' })}
                        className="bg-gradient-to-r from-primary-500 to-secondary-500 hover:from-primary-600 hover:to-secondary-600 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                    >
                        Get Started Today
                    </button>
                </motion.div>
            </div>
        </section>
    );
}