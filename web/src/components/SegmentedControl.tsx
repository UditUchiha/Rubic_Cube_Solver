import clsx from 'clsx';

interface Option<T> {
  value: T;
  label: React.ReactNode;
}

interface Props<T> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  label: string;
  /** Fill the container width, splitting it evenly between options. */
  stretch?: boolean;
  disabled?: boolean;
}

export default function SegmentedControl<T extends string | number>({
  options, value, onChange, label, stretch, disabled,
}: Props<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={clsx('flex bg-slate-900/50 p-1 rounded-xl border border-fg/10', stretch ? 'w-full' : 'w-fit')}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={clsx(
            'px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed',
            stretch && 'flex-1',
            o.value === value
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-fg hover:bg-fg/5'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
