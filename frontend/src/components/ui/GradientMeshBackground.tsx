import React, { useEffect, useState } from 'react';

export const GradientMeshBackground: React.FC = () => {
  const [isTabVisible, setIsTabVisible] = useState(true);

  useEffect(() => {
    const handleVisibility = () => {
      setIsTabVisible(document.visibilityState !== 'hidden');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const playState = isTabVisible ? 'running' : 'paused';

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none transition-colors duration-700"
    >
      {/* Mesh Blob 1 - Top Left */}
      <div
        className="animate-blob-1 absolute -top-[15%] -left-[10%] w-[55vw] h-[55vw] max-w-[650px] max-h-[650px] rounded-full blur-[90px] md:blur-[120px] transition-colors duration-700"
        style={{
          backgroundColor: 'var(--mesh-blob-1)',
          animationPlayState: playState,
        }}
      />

      {/* Mesh Blob 2 - Top Right */}
      <div
        className="animate-blob-2 absolute -top-[10%] -right-[10%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] rounded-full blur-[80px] md:blur-[110px] transition-colors duration-700"
        style={{
          backgroundColor: 'var(--mesh-blob-2)',
          animationPlayState: playState,
        }}
      />

      {/* Mesh Blob 3 - Bottom Center */}
      <div
        className="animate-blob-3 absolute -bottom-[20%] left-[20%] w-[60vw] h-[60vw] max-w-[700px] max-h-[700px] rounded-full blur-[100px] md:blur-[140px] transition-colors duration-700"
        style={{
          backgroundColor: 'var(--mesh-blob-3)',
          animationPlayState: playState,
        }}
      />

      {/* Mesh Blob 4 - Accent Center */}
      <div
        className="animate-blob-2 absolute top-[40%] right-[25%] w-[35vw] h-[35vw] max-w-[450px] max-h-[450px] rounded-full blur-[70px] md:blur-[100px] opacity-70 transition-colors duration-700"
        style={{
          backgroundColor: 'var(--mesh-blob-4)',
          animationPlayState: playState,
        }}
      />

      {/* Ultra-subtle noise grain overlay using SVG data URI filter */}
      <div
        className="absolute inset-0 opacity-[0.035] dark:opacity-[0.05] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
};
