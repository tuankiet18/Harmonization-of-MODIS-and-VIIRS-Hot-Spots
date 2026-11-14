import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { clampMonth, parseMonth } from '../lib/months';
import { IconCalendar, IconNext, IconPrev } from './Icons';
import { toolIcon } from './ui';

interface Props {
  label: string;
  value: string; // 'YYYY-MM'
  min: string;
  max: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * A month you can type (2019-03, 03/2019, Mar 2019) or pick from a small calendar. Enter or leaving the field applies it;
 * a month outside the data is pulled to the nearest end, and something that is not a month is refused with a hint.
 */
export default function MonthInput({ label, value, min, max, onChange, className = 'w-40' }: Props) {
  const { t, months, monthsLong } = useI18n();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const show = (ym: string) => `${months[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
  const [text, setText] = useState(show(value));
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const minYear = Number(min.slice(0, 4));
  const maxYear = Number(max.slice(0, 4));
  const [vy, vm] = value.split('-').map(Number);

  // The value can change from outside (a preset, the arrows, a click on a chart).
  useEffect(() => {
    setText(show(value));
    setInvalid(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (open) setYear(vy);
  }, [open, vy]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /** Apply what was typed. Returns false when it is not a month. */
  const commit = (): boolean => {
    const ym = parseMonth(text);
    if (!ym) {
      setInvalid(true);
      return false;
    }
    const next = clampMonth(ym, { min, max });
    setInvalid(false);
    setText(show(next));
    if (next !== value) onChange(next);
    return true;
  };

  const pick = (m: number) => {
    onChange(`${year}-${String(m).padStart(2, '0')}`);
    setOpen(false);
    field.current?.focus();
  };

  return (
    <div ref={root} className={`relative flex flex-col gap-0.5 text-sm text-muted ${className}`}>
      <label htmlFor={id}>{label}</label>
      <div className={`flex min-h-10 items-center rounded-lg border bg-surface pl-2.5 transition-colors focus-within:border-ink hover:border-ink pointer-coarse:min-h-11 ${invalid ? 'border-red-700' : 'border-line'}`}>
        <input
          ref={field}
          id={id}
          type="text"
          value={text}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-hint` : undefined}
          className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none"
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              setText(show(value));
              setInvalid(false);
            }
          }}
          onBlur={() => {
            if (open) return;
            // Leaving the field with something unreadable puts the last good month back.
            if (!commit()) {
              setText(show(value));
              setInvalid(false);
            }
          }}
        />
        <button
          type="button"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink hover:bg-page pointer-coarse:size-10"
          aria-label={`${label}: ${t('pickMonth')}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((o) => !o)}
        >
          <IconCalendar />
        </button>
      </div>
      {invalid && (
        <span id={`${id}-hint`} role="alert" className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg bg-surface px-2.5 py-1.5 text-sm text-red-700 shadow-float">
          {t('monthHint')}
        </span>
      )}

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
