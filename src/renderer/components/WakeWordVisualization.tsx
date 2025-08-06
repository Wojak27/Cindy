import React, { useEffect, useRef } from 'react';
import { audioCaptureService } from '../services/AudioCaptureService';

interface WakeWordVisualizationProps {
    isActive: boolean;
}

const WakeWordVisualization: React.FC<WakeWordVisualizationProps> = ({ isActive }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);

    useEffect(() => {
        // Initialize analyser and data array when component mounts
        // @ts-ignore - Accessing private property 'analyser' via bracket notation is intentional
        if (audioCaptureService && audioCaptureService['analyser']) {
            analyserRef.current = audioCaptureService['analyser'] as AnalyserNode;
            dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount) as Uint8Array<ArrayBuffer>;
        }

        return () => {
            // Clean up animation frame
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, []);

    useEffect(() => {
        // Clear canvas when not active
        if (!isActive || !canvasRef.current || !analyserRef.current || !dataArrayRef.current) {
            if (canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                }
            }
            // Return cleanup function even when not active
            return () => {
                if (animationRef.current) {
                    cancelAnimationFrame(animationRef.current);
                }
            };
        }

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            // Return cleanup function when context is not available
            return () => {
                if (animationRef.current) {
                    cancelAnimationFrame(animationRef.current);
                }
            };
        }

        // Set canvas dimensions
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const maxRadius = Math.min(centerX, centerY) * 0.7;

        const animate = () => {
            // Get audio data
            if (dataArrayRef.current && analyserRef.current) {
                try {
                    analyserRef.current.getByteTimeDomainData(dataArrayRef.current as Uint8Array<ArrayBuffer>);
                } catch (error) {
                    console.error('Error getting audio data:', error);
                }
            }

            // Calculate audio level (RMS)
            let sum = 0;
            if (dataArrayRef.current) {
                for (let i = 0; i < dataArrayRef.current.length; i++) {
                    const value = (dataArrayRef.current[i] - 128) / 128;
                    sum += value * value;
                }
            }
            const audioLevel = dataArrayRef.current ? Math.sqrt(sum / dataArrayRef.current.length) : 0;

            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw pulsing circles
            const baseRadius = maxRadius * 0.2;
            const pulseRadius = baseRadius * (1 + audioLevel * 2);

            // Draw main circle with glow effect
            const gradient = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.5, centerX, centerY, pulseRadius);
            gradient.addColorStop(0, 'rgba(0, 123, 255, 0.8)');
            gradient.addColorStop(1, 'rgba(0, 123, 255, 0.3)');

            ctx.beginPath();
            ctx.arc(centerX, centerY, pulseRadius, 0, 2 * Math.PI);
            ctx.fillStyle = gradient;
            ctx.shadowColor = 'rgba(0, 123, 255, 0.5)';
            ctx.shadowBlur = 20;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Draw microphone icon
            ctx.beginPath();
            ctx.arc(centerX, centerY, baseRadius * 0.6, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(0, 123, 255, 1)';
            ctx.fill();

            // Draw sound waves
            const rings = 3;
            for (let i = 0; i < rings; i++) {
                const ringRadius = baseRadius * (1.5 + i * 0.8 + audioLevel * 2);
                const opacity = 0.3 - (i * 0.1);
                const lineWidth = 2 + (2 * (1 - i / rings));

                ctx.beginPath();
                ctx.arc(centerX, centerY, ringRadius, 0, 2 * Math.PI);
                ctx.strokeStyle = `rgba(0, 123, 255, ${opacity})`;
                ctx.lineWidth = lineWidth;
                ctx.stroke();
            }

            animationRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [isActive]);

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: isActive ? 'flex' : 'none',
            justifyContent: 'center',
            alignItems: 'center',
            pointerEvents: 'none',
            zIndex: 2000
        }}>
            <canvas
                ref={canvasRef}
                width={200}
                height={200}
                style={{
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)'
                }}
            />
        </div>
    );
};

export default WakeWordVisualization;