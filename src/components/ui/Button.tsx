import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-brand-700 text-white shadow-card hover:bg-brand-800 active:bg-brand-900",
  gold: "bg-gold-400 text-brand-950 shadow-card hover:bg-gold-500",
  secondary:
    "border border-slate-300 bg-white text-slate-800 shadow-card hover:bg-slate-50 active:bg-slate-100",
  ghost: "text-brand-700 hover:bg-brand-50 active:bg-brand-100",
  danger: "bg-red-600 text-white shadow-card hover:bg-red-700",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
  };

type LinkProps = CommonProps & { href: string };

export function Button(props: ButtonProps | LinkProps) {
  if (props.href !== undefined) {
    const { variant = "primary", size = "md", className, children, href } = props;
    return (
      <Link href={href} className={cn(base, variants[variant], sizes[size], className)}>
        {children}
      </Link>
    );
  }

  const { variant = "primary", size = "md", className, children, ...rest } = props;
  return (
    <button
      type="button"
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {children}
    </button>
  );
}
