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

/** A row of keys where exactly one is pressed. */
export default function SegmentedControl<T extends string | number>({
  options, value, onChange, label, stretch, disabled,
}: Props<T>) {
  return (
    <div role="group" aria-label={label} className={clsx('flex gap-1', stretch ? 'w-full' : 'w-fit')}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={clsx(
            'key px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm',
            stretch && 'flex-1',
            o.value === value && 'key-down'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
