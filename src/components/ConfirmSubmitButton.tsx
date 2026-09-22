"use client";

export function ConfirmSubmitButton({
  confirmMessage,
  className,
  children,
  formAction,
}: {
  confirmMessage: string;
  className?: string;
  children: React.ReactNode;
  /** Overrides the parent <form>'s action for this button only (same as the native formaction attribute). */
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <button
      type="submit"
      formAction={formAction}
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
