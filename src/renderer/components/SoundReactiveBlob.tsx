import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createNoise3D, NoiseFunction3D } from 'simplex-noise';
import { audioCaptureService } from '../services/AudioCaptureService';
import { useSettings } from '../hooks/useSettings';

interface Props { isActive: boolean }

const NUM_POINTS = 64;
const NOISE_STEP = 0.006;
const NOISE_SCALE = 15;
const FALLBACK_SIDE = 200;    // px – safe default

export default function SoundReactiveBlob({ isActive }: Props) {
    /* ─────────────────────────── Refs & state ────────────────────────── */
    const svgRef = useRef<SVGSVGElement>(null);
    const pathRef = useRef<SVGPathElement>(null);
    const animationRef = useRef<number | null>(null);

    const analyserRef = useRef<AnalyserNode | null>(null);
    const dataRef = useRef<Uint8Array | null>(null);
    const localCtxRef = useRef<AudioContext | null>(null);          // so we can close it
    const noise3DRef = useRef<NoiseFunction3D>(createNoise3D());
    const zOff = useRef(0);

    const [side, setSide] = useState<number>(FALLBACK_SIDE);
    const { blobSensitivity = 0.5, blobStyle = 'moderate' } = useSettings();

    /* ───────────────────────────── Resize ────────────────────────────── */
    useLayoutEffect(() => {
        if (!svgRef.current) return () => { };
        const ro = new ResizeObserver(([e]) => {
            const s = Math.max(e.contentRect.width, e.contentRect.height);
            setSide(s || FALLBACK_SIDE);
        });
        ro.observe(svgRef.current);
        return () => ro.disconnect();
    }, []);

    /* ──────────────────────── Audio analyser setup ───────────────────── */
    useEffect(() => {
        let cancelled = false;

        (async () => {
            if ((audioCaptureService as any)?.analyser) {
                analyserRef.current = (audioCaptureService as any).analyser as AnalyserNode;
            } else {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (cancelled) return;

                const ctx = new AudioContext();
                localCtxRef.current = ctx;
                const src = ctx.createMediaStreamSource(stream);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 256;
                src.connect(analyser);
                analyserRef.current = analyser;
            }

            if (analyserRef.current)
                dataRef.current = new Uint8Array(analyserRef.current.frequencyBinCount) as Uint8Array<ArrayBuffer>;
        })().catch(err => console.error('Audio init failed:', err));

        return () => {
            cancelled = true;
            localCtxRef.current?.close();
        };
    }, []);

    /* ─────────────── Catmull–Rom → cubic Bézier spline ──────────────── */
    const smoothPath = (pts: { x: number; y: number }[]) => {
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

    /* ────────────────────────── Animation loop ──────────────────────── */
    useEffect(() => {
        if (!isActive) {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            return () => { };
        }

        const animate = () => {
            if (!pathRef.current) {
                animationRef.current = requestAnimationFrame(animate);
                return;
            }

            /* 1. volume RMS (0‒1) */
            let rms = 0;
            if (analyserRef.current && dataRef.current) {
                analyserRef.current.getByteTimeDomainData(dataRef.current as Uint8Array<ArrayBuffer>);
                let sum = 0;
                for (let i = 0; i < dataRef.current.length; i++) {
                    const v = (dataRef.current[i] - 128) / 128;
                    sum += v * v;
                }
                rms = Math.sqrt(sum / dataRef.current.length);
            }

            /* 2. build points */
            const cx = side / 2;
            const cy = side / 2;
            const baseR = side * 0.4;
            zOff.current += NOISE_STEP;

            let intensity = NOISE_SCALE;
            if (blobStyle === 'subtle') intensity *= 0.4;
            if (blobStyle === 'intense') intensity *= 2;

            const amp = 1 + rms * blobSensitivity * 3;
            const pts: { x: number; y: number }[] = [];

            for (let i = 0; i < NUM_POINTS; i++) {
                const theta = (Math.PI * 2 * i) / NUM_POINTS;
                const n = noise3DRef.current(Math.cos(theta) + 1, Math.sin(theta) + 1, zOff.current);
                const r = baseR + n * intensity * amp;
                pts.push({ x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r });
            }

            /* 3. update DOM */
            pathRef.current.setAttribute('d', smoothPath(pts));

            // ───── Enhanced colour palette logic ─────────
            const time = performance.now() * 0.001;

            // Create multiple color palettes that transition based on audio
            const palettes = [
                // Cosmic blues and purples
                { base: 240, range: 60, sat: 90, light: 65 },
                // Sunset oranges and reds
                { base: 15, range: 45, sat: 85, light: 60 },
                // Ocean greens and teals
                { base: 180, range: 40, sat: 80, light: 55 },
                // Warm magenta and pink
                { base: 300, range: 50, sat: 85, light: 65 },
                // Electric cyan and blue
                { base: 200, range: 35, sat: 95, light: 70 }
            ];

            // Select palette based on slow time progression
            const paletteIndex = Math.floor((time * 0.1) % palettes.length);
            const currentPalette = palettes[paletteIndex];

            // Create smooth transition between palettes
            const nextPalette = palettes[(paletteIndex + 1) % palettes.length];
            const transitionFactor = ((time * 0.1) % 1);

            const baseHue = currentPalette.base + (nextPalette.base - currentPalette.base) * transitionFactor;
            const hueRange = currentPalette.range + (nextPalette.range - currentPalette.range) * transitionFactor;
            const saturation = currentPalette.sat + (nextPalette.sat - currentPalette.sat) * transitionFactor;
            const lightness = currentPalette.light + (nextPalette.light - currentPalette.light) * transitionFactor;

            // Apply audio reactivity
            const audioShift = rms * hueRange;
            const finalHue = (baseHue + audioShift + time * 20) % 360;
            const finalSat = Math.min(100, saturation + rms * 15);
            const finalLight = Math.max(40, lightness - rms * 10);

            // Add subtle color variations for depth
            const fillColor = `hsl(${finalHue} ${finalSat}% ${finalLight}% / ${0.85 + rms * 0.15})`;
            const strokeColor = `hsl(${(finalHue + 20) % 360} ${Math.min(100, finalSat + 10)}% ${Math.max(30, finalLight - 20)}% / 0.8)`;

            pathRef.current.setAttribute('fill', fillColor);
            pathRef.current.setAttribute('stroke', strokeColor);

            /* 4. loop */
            animationRef.current = requestAnimationFrame(animate);
        };

        /* draw an initial circle so nothing looks broken */
        if (pathRef.current) {
            const r = side / 2.5;
            pathRef.current.setAttribute(
                'd',
                `M ${side / 2 - r},${side / 2} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0 Z`
            );
        }

        animationRef.current = requestAnimationFrame(animate);
        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [isActive, side, blobSensitivity, blobStyle]);

    /* ───────────────────────────── Render ───────────────────────────── */
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
                width="100%" height="100%"
                viewBox={`0 0 ${side} ${side}`}
                style={{
                    maxWidth: FALLBACK_SIDE,
                    maxHeight: FALLBACK_SIDE,
                    filter: 'drop-shadow(0 0 10px rgba(0,0,0,.4))'
                }}
            >
                <path
                    ref={pathRef}
                    fill="hsl(240 90% 65% / 0.9)"
                    stroke="hsl(260 100% 45% / 0.8)"
                    strokeWidth="2"
                />
            </svg>
        </div>
    );
}
