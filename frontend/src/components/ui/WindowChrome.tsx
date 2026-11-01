import React from 'react';
import { cn } from '@/lib/utils';

export interface WindowChromeProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
}

export const WindowChrome: React.FC<WindowChromeProps> = ({
  title,
  subtitle,
  actions,
  className,
  onClose,
  onMinimize,
  onMaximize,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-4 py-3 border-b border-white/10 select-none text-xs font-medium',
        className
      )}
      {...props}
    >
      {/* macOS Traffic Light Buttons */}
      <div className="flex items-center space-x-2">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] hover:brightness-90 transition-all focus:outline-none"
        />
        <button
          type="button"
          aria-label="Minimize"
          onClick={onMinimize}
          className="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d89e24] hover:brightness-90 transition-all focus:outline-none"
        />
        <button
          type="button"
          aria-label="Maximize"
          onClick={onMaximize}
          className="w-3 h-3 rounded-full bg-[#28c840] border border-[#1aab29] hover:brightness-90 transition-all focus:outline-none"
        />
      </div>

      {/* Title / Subtitle */}
      {title && (
        <div className="flex items-center space-x-1.5 text-muted-foreground truncate max-w-[60%] text-center">
          <span className="font-medium text-foreground truncate">{title}</span>
          {subtitle && (
            <>
              <span className="opacity-40">•</span>
              <span className="truncate opacity-75">{subtitle}</span>
            </>
          )}
        </div>
      )}

      {/* Right actions slot */}
      <div className="flex items-center space-x-2">
        {actions || <div className="w-12" aria-hidden="true" />}
      </div>
    </div>
  );
};
