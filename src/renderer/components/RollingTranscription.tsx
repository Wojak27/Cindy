import { useEffect, useRef, useState } from 'react';

interface Props {
    text: string;
    isRecording: boolean;
}

export default function RollingTranscription({ text, isRecording }: Props) {
    const [displayText, setDisplayText] = useState('');
    const [isAnimating, setIsAnimating] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!text) {
            setDisplayText('');
            return () => { };
        }

        setIsAnimating(true);

        // Type writer effect
        let currentIndex = 0;
        const typeInterval = setInterval(() => {
            if (currentIndex <= text.length) {
                setDisplayText(text.substring(0, currentIndex));
                currentIndex++;
            } else {
                clearInterval(typeInterval);
                setIsAnimating(false);
            }
        }, 50);

        return () => clearInterval(typeInterval);
    }, [text]);

    useEffect(() => {
        // Auto scroll to bottom
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [displayText]);

    if (!isRecording && !displayText) return null;

    return (
        <div
            ref={scrollRef}
            className={`rolling-transcription ${isRecording ? 'recording' : ''} ${isAnimating ? 'animating' : ''}`}
            style={{
                position: 'absolute',
                bottom: '80px',
                left: '20px',
                right: '20px',
                maxHeight: '150px',
                overflowY: 'auto',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(10px)',
                borderRadius: '12px',
                padding: '16px',
                fontSize: '16px',
                lineHeight: '1.5',
                color: '#333',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                transition: 'all 0.3s ease',
                transform: displayText || isRecording ? 'translateY(0)' : 'translateY(100%)',
                opacity: displayText || isRecording ? 1 : 0,
                zIndex: 1000
            }}
        >
            {isRecording && !displayText && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#666',
                    fontStyle: 'italic'
                }}>
                    <div className="recording-indicator" style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#ff4444',
                        animation: 'pulse 1s infinite'
                    }} />
                    Listening...
                </div>
            )}

            {displayText && (
                <div>
                    <div style={{
                        fontSize: '12px',
                        color: '#888',
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        Transcription
                    </div>
                    <div>{displayText}</div>
                    {isAnimating && (
                        <span style={{
                            marginLeft: '2px',
                            animation: 'blink 1s infinite'
                        }}>|</span>
                    )}
                </div>
            )}

            <style>
                {`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
                
                @keyframes blink {
                    0%, 50% { opacity: 1; }
                    51%, 100% { opacity: 0; }
                }
                
                .rolling-transcription::-webkit-scrollbar {
                    width: 4px;
                }
                
                .rolling-transcription::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 2px;
                }
                
                .rolling-transcription::-webkit-scrollbar-thumb {
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 2px;
                }
                
                .rolling-transcription::-webkit-scrollbar-thumb:hover {
                    background: rgba(0, 0, 0, 0.3);
                }
                `}
            </style>
        </div>
    );
}