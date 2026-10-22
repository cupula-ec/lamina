"use client";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      toastOptions={{
        unstyled: false,
        classNames: { toast: "!rounded-lg !border-2 !border-ink !bg-white !text-ink !shadow-[3px_3px_0_var(--color-ink)] !font-sans", description: "!text-ink-2" },
      }}
    />
  );
}
