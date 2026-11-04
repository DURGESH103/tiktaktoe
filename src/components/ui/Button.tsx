"use client";

import clsx from "clsx";
import { motion, type HTMLMotionProps } from "framer-motion";
import Link from "next/link";
import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "whatsapp" | "romance";
type Size = "md" | "lg";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 rounded-2xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600 text-white shadow-lg shadow-fuchsia-500/25 hover:brightness-110",
  secondary: "glass text-fg hover:bg-fg/[0.08]",
  ghost: "text-muted hover:bg-fg/[0.06] hover:text-fg",
  danger: "bg-danger/10 text-danger hover:bg-danger/20",
  // Couple Challenge accent. Deep enough that white text keeps ≥4.5:1 contrast.
  romance: "bg-gradient-to-br from-rose-600 via-pink-600 to-fuchsia-600 text-white shadow-lg shadow-rose-500/30 hover:brightness-110",
  // Darker than WhatsApp's brand green so white text keeps ≥4.5:1 contrast.
  whatsapp: "bg-emerald-700 text-white shadow-lg shadow-emerald-700/25 hover:bg-emerald-800",
};

const sizes: Record<Size, string> = {
  md: "min-h-12 px-4 text-[15px]",
  lg: "min-h-14 px-6 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return clsx(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {children as React.ReactNode}
    </motion.button>
  );
});

const MotionLink = motion.create(Link);

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <MotionLink href={href} whileTap={{ scale: 0.97 }} className={buttonClass(variant, size, className)}>
      {children}
    </MotionLink>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx("h-4 w-4 motion-safe:animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
