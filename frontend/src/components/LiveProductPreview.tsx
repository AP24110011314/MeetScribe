import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Play, Sparkles, ShieldCheck, Zap } from 'lucide-react';
import { WindowChrome } from '@/components/ui/WindowChrome';
import { Badge } from '@/components/ui/Badge';

export const LiveProductPreview: React.FC = () => {
  return (
    <div className="space-y-6 max-w-lg mx-auto">
      {/* Floating Glass Mock Window */}
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        className="glass-card shadow-2xl border border-white/20 overflow-hidden"
      >
        <WindowChrome
          title="Q3 Product Roadmap Review"
          subtitle="42m 18s"
          actions={
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Completed
            </span>
          }
        />

        <div className="p-5 space-y-4">
          {/* Simulated Audio Waveform Bar */}
          <div className="p-3.5 rounded-xl glass-card-subtle border border-white/10 flex items-center gap-3">
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-md shrink-0 hover:scale-105 transition-transform"
            >
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            </button>
            <div className="flex-1 flex items-center gap-1 h-6">
              {[40, 65, 30, 85, 95, 45, 60, 35, 75, 90, 50, 70, 80, 45, 60, 30, 70, 95, 60, 40, 80, 55, 30].map(
                (h, idx) => (
                  <div
                    key={idx}
                    className="flex-1 rounded-full transition-all duration-300"
                    style={{
                      height: `${h}%`,
                      backgroundColor: idx < 12 ? 'var(--mesh-blob-1)' : 'rgba(255,255,255,0.2)',
                    }}
                  />
                )
              )}
            </div>
            <span className="text-xs font-mono text-muted-foreground tabular-nums">14:20</span>
          </div>

          {/* AI Executive Summary Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Executive Summary</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The team agreed to prioritize on-device Whisper transcription to achieve sub-second latency on M-series chips, finalizing v2.0 specs by end of sprint.
            </p>
          </div>

          {/* Action Items List */}
          <div className="space-y-2 pt-1 border-t border-white/10">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span>Action Items</span>
              <span className="text-[11px] text-muted-foreground">3 assigned</span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between p-2 rounded-xl glass-card-subtle border border-white/10 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="truncate font-medium">Benchmark Whisper int8 on macOS</span>
                </div>
                <Badge variant="outline" className="text-[10px] py-0 px-2 shrink-0">
                  Alex • Today
                </Badge>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl glass-card-subtle border border-white/10 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <div className="w-4 h-4 rounded-full border-2 border-primary/50 shrink-0" />
                  <span className="truncate font-medium">Finalize Gemini prompt schemas</span>
                </div>
                <Badge variant="warning" className="text-[10px] py-0 px-2 shrink-0">
                  Sarah • Friday
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 3 Short Benefit Lines */}
      <div className="grid grid-cols-1 gap-3 pt-2">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="w-7 h-7 rounded-lg glass-card-subtle flex items-center justify-center text-primary shrink-0 border border-white/10">
            <Zap className="w-3.5 h-3.5" />
          </div>
          <span>
            <strong className="text-foreground">Near-instant transcription:</strong> High accuracy 16 kHz Whisper CPU inference.
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="w-7 h-7 rounded-lg glass-card-subtle flex items-center justify-center text-primary shrink-0 border border-white/10">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span>
            <strong className="text-foreground">Structured accountability:</strong> Owners, priorities, and verified decisions extracted.
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="w-7 h-7 rounded-lg glass-card-subtle flex items-center justify-center text-primary shrink-0 border border-white/10">
            <ShieldCheck className="w-3.5 h-3.5" />
          </div>
          <span>
            <strong className="text-foreground">Private & Secure:</strong> Direct S3 presigned transfers with strict role ownership.
          </span>
        </div>
      </div>
    </div>
  );
};
