import React, { useEffect, useRef, useState } from 'react';
import { audioCaptureService } from '../services/AudioCaptureService';
import { useSettings } from '../hooks/useSettings';

interface SoundReactiveBlobProps {
    isActive: boolean;
}

const SoundReactiveBlob: React.FC<SoundReactiveBlobProps> = ({ isActive }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const animationRef = useRef<number | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);
    const pointsRef = useRef<Array<{ x: number; y: number }>>([]);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    // Get blob settings from store
    const { blobSensitivity = 0.5, blobStyle = 'moderate' } = useSettings();

    // Initialize points for the blob
    useEffect(() => {
        const initializePoints = () => {
            const numPoints = 8;
            const angleStep = (Math.PI * 2) / numPoints;
            const cx = dimensions.width / 2;
            const cy = dimensions.height / 2;
            const minRadius = Math.min(cx, cy) * 0.3;
            const maxRadius = Math.min(cx, cy) * 0.7;

            const points = [];
            for (let i = 0; i < numPoints; i++) {
                const angle = i * angleStep;
                const radius = minRadius + Math.random() * (maxRadius - minRadius);
                points.push({
                    x: cx + radius * Math.cos(angle),
                    y: cy + radius * Math.sin(angle)
                });
            }
            pointsRef.current = points;
        };

        if (dimensions.width > 0 && dimensions.height > 0) {
            initializePoints();
        }
    }, [dimensions]);

    // Set up audio analyzer
    useEffect(() => {
        if (audioCaptureService && (audioCaptureService as any)['analyser']) {
            analyserRef.current = (audioCaptureService as any)['analyser'] as AnalyserNode;
            dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, []);

    // Handle resize
    useEffect(() => {
        const updateDimensions = () => {
            if (svgRef.current) {
                const rect = svgRef.current.getBoundingClientRect();
                setDimensions({ width: rect.width, height: rect.height });
            }
        };

        updateDimensions();
        window.addEventListener('resize', updateDimensions);
        return () => window.removeEventListener('resize', updateDimensions);
    }, []);

    // Animation loop
    useEffect(() => {
        // Return early if conditions aren't met
        if (!isActive || !svgRef.current || !analyserRef.current || !dataArrayRef.current) {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
            return;
        }

        const animate = () => {
            // Get audio data
            if (dataArrayRef.current && analyserRef.current) {
                try {
                    // Cast to ArrayBuffer to resolve type mismatch
                    analyserRef.current.getByteTimeDomainData(dataArrayRef.current as unknown as Uint8Array<ArrayBuffer>);
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

            // Apply sensitivity from settings
            const sensitivity = blobSensitivity * 2; // Scale 0-1 to 0-2
            const deformation = audioLevel * sensitivity;

            // Update point positions based on audio level
            if (pointsRef.current.length > 0) {
                const cx = dimensions.width / 2;
                const cy = dimensions.height / 2;
                const baseRadius = Math.min(cx, cy) * 0.5;
                const numPoints = pointsRef.current.length;
                const angleStep = (Math.PI * 2) / numPoints;

                // Style-based parameters
                let maxDeformation = 0.3;
                let smoothness = 0.8;
                let baseMovement = 0.05;

                switch (blobStyle) {
                    case 'subtle':
                        maxDeformation = 0.15;
                        smoothness = 0.9;
                        baseMovement = 0.03;
                        break;
                    case 'intense':
                        maxDeformation = 0.6;
                        smoothness = 0.6;
                        baseMovement = 0.08;
                        break;
                    default: // moderate
                        maxDeformation = 0.3;
                        smoothness = 0.8;
                        baseMovement = 0.05;
                }

                // Add base movement even when no sound
                const timeBasedDeformation = Math.sin(performance.now() * 0.001) * baseMovement;

                switch (blobStyle) {
                    case 'subtle':
                        maxDeformation = 0.15;
                        smoothness = 0.9;
                        baseMovement = 0.03;
                        break;
                    case 'intense':
                        maxDeformation = 0.6;
                        smoothness = 0.6;
                        baseMovement = 0.08;
                        break;
                    default: // moderate
                        maxDeformation = 0.3;
                        smoothness = 0.8;
                        baseMovement = 0.05;
                }


                // Apply deformation to points
                for (let i = 0; i < numPoints; i++) {
                    const angle = i * angleStep;
                    const targetRadius = baseRadius * (1 + Math.sin(performance.now() * 0.001 + angle) * 0.1);
                    const waveEffect = Math.sin(performance.now() * 0.002 + i) * 0.1;
                    // Combine sound deformation with base movement
                    const totalDeformation = deformation + timeBasedDeformation;
                    const radius = targetRadius * (1 + totalDeformation * maxDeformation * (1 + waveEffect));

                    // Smooth transition to new position
                    const targetX = cx + radius * Math.cos(angle);
                    const targetY = cy + radius * Math.sin(angle);

                    pointsRef.current[i].x += (targetX - pointsRef.current[i].x) * smoothness;
                    pointsRef.current[i].y += (targetY - pointsRef.current[i].y) * smoothness;
                }

                // Update SVG path
                const svg = svgRef.current;
                if (svg) {
                    const path = svg.querySelector('path') as SVGPathElement;
                    if (path) {
                        // Create smooth blob path using cubic Bezier curves
                        let d = `M ${pointsRef.current[0].x} ${pointsRef.current[0].y} `;

                        for (let i = 0; i < numPoints; i++) {
                            const next = (i + 1) % numPoints;
                            // const next2 = (i + 2) % numPoints; // Unused variable - kept as comment for potential future use

                            // Calculate control points for smooth curve
                            const dx = pointsRef.current[next].x - pointsRef.current[i].x;
                            const dy = pointsRef.current[next].y - pointsRef.current[i].y;
                            const len = Math.sqrt(dx * dx + dy * dy) * 0.5;

                            const angle = Math.atan2(dy, dx);
                            const control1Angle = angle - Math.PI / 2;
                            const control2Angle = angle + Math.PI / 2;

                            const c1x = pointsRef.current[i].x + len * Math.cos(control1Angle);
                            const c1y = pointsRef.current[i].y + len * Math.sin(control1Angle);
                            const c2x = pointsRef.current[next].x + len * Math.cos(control2Angle);
                            const c2y = pointsRef.current[next].y + len * Math.sin(control2Angle);

                            d += `C ${c1x} ${c1y}, ${c2x} ${c2y}, ${pointsRef.current[next].x} ${pointsRef.current[next].y} `;
                        }

                        d += 'Z';
                        path.setAttribute('d', d);
                    }
                }
            }

            animationRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [isActive, dimensions, blobSensitivity, blobStyle]);

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            pointerEvents: 'none',
            zIndex: 2000
        }}>
            <svg
                ref={svgRef}
                style={{
                    width: '100%',
                    height: '100%',
                    maxWidth: '200px',
                    maxHeight: '200px',
                    filter: 'drop-shadow(0 0 10px rgba(0, 123, 255, 0.5))'
                }}
            >
                <defs>
                    <radialGradient id="blobGradient" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="rgba(0, 123, 255, 0.8)" />
                        <stop offset="100%" stopColor="rgba(0, 123, 255, 0.3)" />
                    </radialGradient>
                </defs>
                <path
                    d="M 100 50 C 120 30, 140 30, 160 50 C 180 70, 180 90, 160 110 C 140 130, 120 130, 100 110 C 80 90, 80 70, 100 50 Z"
                    fill="url(#blobGradient)"
                    stroke="rgba(0, 123, 255, 0.5)"
                    strokeWidth="2"
                />
            </svg>
        </div>
    );
};

export default SoundReactiveBlob;