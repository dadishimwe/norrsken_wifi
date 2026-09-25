import { useEffect, useId, useRef, useState } from "react";

export type SelectOption = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

/** Accessible custom dropdown — matches ops / feedback visual language. */
export function CustomSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`cselect${className ? ` ${className}` : ""}${open ? " open" : ""}`} ref={rootRef}>
      <span className="cselect-label">{label}</span>
      <div className="cselect-control">
        <button
          type="button"
          className="cselect-trigger"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => !disabled && setOpen((v) => !v)}
        >
          <span className="cselect-value">{selected?.label ?? "—"}</span>
          <span className="cselect-chevron" aria-hidden="true" />
        </button>
        {open ? (
          <ul className="cselect-menu" role="listbox" id={listId}>
            {options.map((o) => (
              <li key={o.value} role="option" aria-selected={o.value === value}>
                <button
                  type="button"
                  className={o.value === value ? "on" : ""}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
