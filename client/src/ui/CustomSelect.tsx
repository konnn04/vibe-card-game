'use client';
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { playSfx } from '@/src/lib/audio';

export interface Option<T> {
  value: T;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps<T> {
  value: T;
  options: Option<T>[];
  onChange: (val: T) => void;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string | number | boolean>({
  value,
  options,
  onChange,
  compact = false,
  disabled = false,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`inline-flex w-full items-center rounded-xl bg-black/40 p-1 border border-white/10 ${className}`}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (opt.value !== value) {
                playSfx('click');
                onChange(opt.value);
              }
            }}
            className={`display flex flex-1 items-center justify-center gap-1.5 rounded-lg font-bold transition-all ${
              compact ? 'px-2 py-1 text-[12px]' : 'px-3 py-1.5 text-[14px]'
            } ${
              isSelected
                ? 'bg-gradient-to-r from-[#FFD34D] to-[#FF9E2C] text-[#2A1508] shadow-[0_2px_8px_rgba(255,180,50,0.3)] border border-white/50'
                : 'text-[#FFE5C4]/75 hover:bg-white/10 hover:text-white border border-transparent'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface CompactSelectProps<T> {
  label?: string;
  value: T;
  options: Option<T>[];
  onChange: (val: T) => void;
  compact?: boolean;
  disabled?: boolean;
}

export function CompactSelect<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
  compact = false,
  disabled = false,
}: CompactSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOpt = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block w-full text-left">
      {label && <div className="label-sm mb-1 text-[#FFD34D]">{label}</div>}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            playSfx('click');
            setOpen(!open);
          }
        }}
        className={`flex w-full items-center justify-between gap-2 rounded-xl bg-black/40 border border-white/15 px-3 transition-all hover:border-[#FFD34D]/60 ${
          compact ? 'py-1.5 text-[13px]' : 'py-2 text-[14px]'
        } text-[#FFF3DA] ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className="font-semibold">{selectedOpt?.label ?? String(value)}</span>
        <ChevronDown size={14} className={`text-[#FFD34D] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 max-h-56 w-full min-w-[120px] overflow-auto rounded-xl border border-amber-500/30 bg-[#1e0e15]/95 p-1 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => {
                  playSfx('click');
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold transition-all ${
                  isSelected
                    ? 'bg-gradient-to-r from-[#FFD34D]/25 to-[#FF9E2C]/25 text-[#FFD34D]'
                    : 'text-[#FFE5C4]/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div>
                  <span>{opt.label}</span>
                  {opt.sublabel && <span className="ml-1.5 text-[11px] text-[#C79A76]">({opt.sublabel})</span>}
                </div>
                {isSelected && <Check size={13} className="text-[#FFD34D]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
