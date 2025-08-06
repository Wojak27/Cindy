import React, { useEffect, useRef, useState } from 'react';
import { createNoise3D, NoiseFunction3D } from 'simplex-noise';
import { audioCaptureService } from '../services/AudioCaptureService';
import { useSettings } from '../hooks/useSettings';

interface SoundReactiveBlobProps {
    isActive: boolean;
}

const NUM_POINTS = 32;
const NOISE_STEP = 0.006;
const NOISE_SCALE = 15;

const SoundReactiveBlob: React.FC<SoundReactiveBlobProps> = ({ isActive }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const pathRef = useRef<SVGPathElement>(null);
    const animationRef = useRef<number | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);

    const noise3DRef = useRef<NoiseFunction3D>(createNoise3D());
    const zOff = useRef(0);

    const [size, setSize] = useState({ w: 0, h: 0 });
    const { blobSensitivity = 0.5, blobStyle = 'moderate' } = useSettings();

    /* Resize observer */
    useEffect(() => {
        const update = () => {
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const side = Math.min(rect.width, rect.height);
            setSize({ w: side, h: side });
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    /* WebAudio analyser hookup */
    useEffect(() => {
        if ((audioCaptureService as any)?.analyser) {
            analyserRef.current = (audioCaptureService as any).analyser as AnalyserNode;
            dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount) as Uint8Array<ArrayBuffer>;
        }
    }, []);

    /* Cardinal spline util */
    const toSmoothPath = (pts: { x: number; y: number }[]) => {
        const n = pts.length;
        let d = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 0; i < n; i++) {
            const p0 = pts[(i - 1 + n) % n];
            const p1 = pts[i];
            const p2 = pts[(i + 1) % n];
            const p3 = pts[(i + 2) % n];
            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;
            d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
        }
        return d + ' Z';
    };

    /* Animation loop */
    useEffect(() => {
        if (!isActive) {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            return () => { };
        }

        const animate = () => {
            const { w, h } = size;
            if (!w || !h || !pathRef.current) {
                animationRef.current = requestAnimationFrame(animate);
                return;
            }

            /* 1. audio RMS */
            let rms = 0;
            if (analyserRef.current && dataArrayRef.current) {
                analyserRef.current.getByteTimeDomainData(dataArrayRef.current as Uint8Array<ArrayBuffer>);
                const arr = dataArrayRef.current;
                let sum = 0;
                for (let i = 0; i < arr.length; i++) {
                    const v = (arr[i] - 128) / 128;
                    sum += v * v;
                }
                rms = Math.sqrt(sum / arr.length);
            }

            /* 2. points via simplex noise */
            const cx = w / 2;
            const cy = h / 2;
            const baseRadius = w * 0.4;
            zOff.current += NOISE_STEP;

            const pts = [];
            for (let i = 0; i < NUM_POINTS; i++) {
                const theta = (Math.PI * 2 * i) / NUM_POINTS;
                const noiseVal = noise3DRef.current(
                    Math.cos(theta) + 1,
                    Math.sin(theta) + 1,
                    zOff.current
                ); // -1..1

                let intensity = NOISE_SCALE;
                if (blobStyle === 'subtle') intensity *= 0.4;
                if (blobStyle === 'intense') intensity *= 2;

                const audioBoost = 1 + rms * blobSensitivity * 2;
                const r = baseRadius + noiseVal * intensity * audioBoost;
                pts.push({ x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r });
            }

            pathRef.current.setAttribute('d', toSmoothPath(pts));
            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);
        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [isActive, size, blobSensitivity, blobStyle]);

    return (
        <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            pointerEvents: 'none',
            zIndex: 2000
        }}>
            <svg
                ref={svgRef}
                width="100%"
                height="100%"
                viewBox={`0 0 ${size.w} ${size.h}`}
                style={{ maxWidth: 200, maxHeight: 200, filter: 'drop-shadow(0 0 10px rgba(0,123,255,.5))' }}
            >
                <defs>
                    <radialGradient id="blobGradient" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="rgba(0,123,255,0.8)" />
                        <stop offset="100%" stopColor="rgba(0,123,255,0.3)" />
                    </radialGradient>
                </defs>
                <path
                    ref={pathRef}
                    fill="url(#blobGradient)"
                    stroke="rgba(0,123,255,0.5)"
                    strokeWidth="2"
                />
            </svg>
        </div>
    );
};

export default SoundReactiveBlob;
