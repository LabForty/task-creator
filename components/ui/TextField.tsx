"use client";

import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type LabelProps = { label: string; description?: string; error?: string };

const fieldBase =
  "w-full rounded-md bg-surface border border-rule " +
  "text-hig-body text-ink placeholder:text-ink-tertiary " +
  "transition-all duration-150 ease-hig " +
  "focus:outline-none focus:border-accent focus:shadow-focus " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

const errorRing = "border-danger focus:border-danger";

export const TextField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & LabelProps
>(function TextField({ label, description, error, className = "", id, ...rest }, ref) {
  const inputId = id ?? `tf-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const labelId = `${inputId}-label`;
  const errorId = `${inputId}-error`;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5">
      <span id={labelId} data-label className="text-hig-subhead font-medium text-ink">{label}</span>
      {description && (
        <span className="text-hig-footnote text-ink-secondary">{description}</span>
      )}
      <input
        ref={ref}
        id={inputId}
        data-input
        aria-labelledby={labelId}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(fieldBase, "h-10 px-3", error && errorRing, className)}
        {...rest}
      />
      {error && <span id={errorId} className="text-hig-footnote text-danger">{error}</span>}
    </label>
  );
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & LabelProps
>(function TextArea({ label, description, error, className = "", id, ...rest }, ref) {
  const areaId = id ?? `ta-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const labelId = `${areaId}-label`;
  const errorId = `${areaId}-error`;
  return (
    <label htmlFor={areaId} className="flex flex-col gap-1.5">
      <span id={labelId} data-label className="text-hig-subhead font-medium text-ink">{label}</span>
      {description && (
        <span className="text-hig-footnote text-ink-secondary">{description}</span>
      )}
      <textarea
        ref={ref}
        id={areaId}
        data-input
        aria-labelledby={labelId}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(fieldBase, "p-3 leading-relaxed resize-y", error && errorRing, className)}
        {...rest}
      />
      {error && <span id={errorId} className="text-hig-footnote text-danger">{error}</span>}
    </label>
  );
});
