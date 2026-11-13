import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { IconCalendar, IconNext, IconPrev } from './Icons';
import { toolIcon } from './ui';

interface Props {
  label: string;
  value: string; // 'YYYY-MM'
  min: string;
  max: string;
  onChange: (value: string) => void;
}

/** Month picker: a button that opens a year header and a 12-month grid. Replaces the browser's native month input. */
export default function MonthPicker({ label, value, min, max, onChange }: Props) {
  const { months, monthsLong } = useI18n();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const minYear = Number(min.slice(0, 4));
  const maxYear = Number(max.slice(0, 4));
  const [vy, vm] = value.split('-').map(Number);

  useEffect(() => {
    if (open) setYear(vy);
  }, [open, vy]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (m: number) => {
    onChange(`${year}-${String(m).padStart(2, '0')}`);
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div ref={root} className="relative flex w-36 flex-col gap-0.5 text-sm text-muted">
      <span id={`${id}-label`}>{label}</span>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 text-base text-ink transition-colors hover:border-ink pointer-coarse:min-h-11"
      >
        <span id={`${id}-value`}>
          {months[vm - 1]} {vy}
        </span>
        <IconCalendar />
      </button>

      {open && (
        <div role="dialog" aria-label={label} className="absolute left-0 top-full z-30 mt-1.5 w-64 rounded-2xl bg-surface p-3 text-base text-ink shadow-float ring-1 ring-line">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className={toolIcon} aria-label={String(year - 1)} disabled={year <= minYear} onClick={() => setYear((y) => y - 1)}>
              <IconPrev />
            </button>
            <b className="font-display text-2xl font-semibold">{year}</b>
            <button type="button" className={toolIcon} aria-label={String(year + 1)} disabled={year >= maxYear} onClick={() => setYear((y) => y + 1)}>
              <IconNext />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={String(year)}>
            {months.map((name, i) => {
              const m = i + 1;
              const ym = `${year}-${String(m).padStart(2, '0')}`;
              const selected = year === vy && m === vm;
              return (
                <button
                  key={name}
                  type="button"
                  aria-label={`${monthsLong[i]} ${year}`}
                  aria-pressed={selected}
                  disabled={ym < min || ym > max}
                  onClick={() => pick(m)}
                  className={`min-h-10 rounded-lg font-medium transition-colors pointer-coarse:min-h-11 disabled:cursor-not-allowed disabled:opacity-30 ${
                    selected ? 'bg-ink text-white' : 'hover:bg-page'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
