"use client";

import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";

type LabelProps = { label: string; description?: string };

const fieldBase =
  "w-full rounded-md bg-surface border border-rule " +
  "text-hig-body text-ink placeholder:text-ink-tertiary " +
  "transition-all duration-150 ease-hig " +
  "focus:outline-none focus:border-accent focus:shadow-focus " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export const TextField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & LabelProps
>(function TextField({ label, description, className = "", id, ...rest }, ref) {
  const inputId = id ?? `tf-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5">
      <span data-label className="text-hig-subhead font-medium text-ink">{label}</span>
      {description && (
        <span className="text-hig-footnote text-ink-secondary">{description}</span>
      )}
      <input
        ref={ref}
        id={inputId}
        data-input
        className={`${fieldBase} h-10 px-3 ${className}`}
        {...rest}
      />
    </label>
  );
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & LabelProps
>(function TextArea({ label, description, className = "", id, ...rest }, ref) {
  const areaId = id ?? `ta-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <label htmlFor={areaId} className="flex flex-col gap-1.5">
      <span data-label className="text-hig-subhead font-medium text-ink">{label}</span>
      {description && (
        <span className="text-hig-footnote text-ink-secondary">{description}</span>
      )}
      <textarea
        ref={ref}
        id={areaId}
        data-input
        className={`${fieldBase} p-3 leading-relaxed resize-y ${className}`}
        {...rest}
      />
    </label>
  );
});
