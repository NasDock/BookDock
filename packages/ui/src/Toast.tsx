import React from 'react';
import { X } from 'lucide-react';
import { cn } from './utils';

export interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  visible: boolean;
  onClose?: () => void;
}

const toastStyles: Record<string, string> = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-yellow-600 text-white',
  info: 'bg-blue-600 text-white',
};

export function Toast({ message, type = 'info', visible, onClose }: ToastProps) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg transition-all duration-300',
        toastStyles[type]
      )}
      role="alert"
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{message}</span>
        {onClose && (
          <button onClick={onClose} className="text-white/80 hover:text-white ml-2">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
