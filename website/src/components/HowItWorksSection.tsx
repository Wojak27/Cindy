import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Mic, MessageSquare, Brain, Zap } from 'lucide-react';

const steps = [
    {
        icon: Mic,
        title: 'Speak Naturally',
        description: 'Just say "Hey Cindy" or click the microphone. Your voice is processed locally using advanced speech recognition.',
        step: '01'
    },
    {
        icon: MessageSquare,
        title: 'AI Understanding',
        description: 'Your request is processed by local language models that understand context, intent, and maintain conversation history.',
        step: '02'
    },
    {
        icon: Brain,
        title: 'Smart Processing',
        description: 'Cindy accesses your knowledge base, performs research, and uses various tools to provide comprehensive responses.',
        step: '03'
    },
    {
        icon: Zap,
        title: 'Instant Response',
        description: 'Receive spoken or written responses with citations, follow-up questions, and actionable insights.',
        step: '04'
    }
];

export default function HowItWorksSection() {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: "-100px" });

    return (
        <section id="how-it-works" ref={ref} className="py-20 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.8 }}
                    className="text-center mb-16"
                >
                    <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
                        How It{' '}
                        <span className="bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">
                            Works
                        </span>
                    </h2>
                    <p className="text-xl text-gray-300 max-w-3xl mx-auto">
                        Experience seamless AI interaction with four simple steps. 
                        Everything happens locally on your device for maximum privacy and speed.
                    </p>
                </motion.div>

                {/* Steps */}
                <div className="relative">
                    {/* Connection Lines */}
                    <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-primary-500/20 via-secondary-500/20 to-primary-500/20 transform -translate-y-1/2" />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4">
                        {steps.map((step, index) => (
                            <motion.div
                                key={step.title}
                                initial={{ opacity: 0, y: 50 }}
                                animate={isInView ? { opacity: 1, y: 0 } : {}}
                                transition={{ duration: 0.8, delay: index * 0.2 }}
                                className="relative text-center group"
                            >
                                {/* Step Number */}
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={isInView ? { scale: 1 } : {}}
                                    transition={{ duration: 0.5, delay: index * 0.2 + 0.3 }}
                                    className="absolute -top-4 -right-4 w-12 h-12 bg-gradient-to-r from-primary-500 to-secondary-500 rounded-full flex items-center justify-center text-white font-bold text-lg z-10 group-hover:scale-110 transition-transform duration-300"
                                >
                                    {step.step}
                                </motion.div>

                                {/* Main Card */}
                                <div className="relative p-8 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 hover:border-white/20 transition-all duration-300 hover:transform hover:scale-105 hover:shadow-2xl">
                                    {/* Icon Container */}
                                    <div className="relative mb-6">
                                        <motion.div
                                            initial={{ rotateY: -90 }}
                                            animate={isInView ? { rotateY: 0 } : {}}
                                            transition={{ duration: 0.8, delay: index * 0.2 + 0.1 }}
                                            className="w-16 h-16 mx-auto bg-gradient-to-br from-primary-500 to-secondary-500 rounded-2xl flex items-center justify-center group-hover:rotate-12 transition-transform duration-300"
                                        >
                                            <step.icon className="w-8 h-8 text-white" />
                                        </motion.div>
                                        
                                        {/* Glow Effect */}
                                        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/20 to-secondary-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    </div>

                                    {/* Content */}
                                    <h3 className="text-xl font-semibold text-white mb-4 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-primary-400 group-hover:to-secondary-400 group-hover:bg-clip-text transition-all duration-300">
                                        {step.title}
                                    </h3>
                                    <p className="text-gray-400 group-hover:text-gray-300 transition-colors duration-300 leading-relaxed">
                                        {step.description}
                                    </p>
                                </div>

                                {/* Connection Arrow (Mobile) */}
                                {index < steps.length - 1 && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0 }}
                                        animate={isInView ? { opacity: 1, scale: 1 } : {}}
                                        transition={{ duration: 0.5, delay: index * 0.2 + 0.8 }}
                                        className="flex lg:hidden justify-center mt-8 mb-4"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-primary-500 to-secondary-500 flex items-center justify-center">
                                            <svg className="w-4 h-4 text-white transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                            </svg>
                                        </div>
                                    </motion.div>
                                )}
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Bottom Section */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.8, delay: 1.2 }}
                    className="text-center mt-16"
                >
                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8 max-w-4xl mx-auto">
                        <h3 className="text-2xl font-semibold text-white mb-4">
                            🔒 Privacy by Design
                        </h3>
                        <p className="text-gray-300 text-lg">
                            Everything happens on your device. No data leaves your computer unless you explicitly 
                            choose to use online features. Your conversations, files, and personal information 
                            remain completely private and secure.
                        </p>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}