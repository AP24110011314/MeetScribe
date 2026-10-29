import React from 'react';
import { cn } from '@/lib/utils';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getColor(name: string): string {
  const colors = [
    'bg-indigo-500 text-white',
    'bg-violet-500 text-white',
    'bg-blue-500 text-white',
    'bg-emerald-500 text-white',
    'bg-amber-500 text-white',
    'bg-rose-500 text-white',
    'bg-cyan-500 text-white',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({ name, size = 'md', className, ...props }: AvatarProps) {
  const sizeMap = {
    sm: 'h-7 w-7 text-xs',
    md: 'h-9 w-9 text-sm',
    lg: 'h-11 w-11 text-base',
  };

  const initials = getInitials(name);
  const color = getColor(name);

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full font-medium shadow-sm',
        sizeMap[size],
        color,
        className
      )}
      {...props}
    >
      {initials}
    </div>
  );
}
