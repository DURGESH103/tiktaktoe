import clsx from "clsx";
import { gradientFor } from "@/lib/avatars";

const sizes = {
  xs: "h-6 w-6 text-sm !ring-1",
  sm: "h-9 w-9 text-lg",
  chip: "h-10 w-10 text-xl sm:h-12 sm:w-12 sm:text-2xl",
  md: "h-12 w-12 text-2xl",
  lg: "h-20 w-20 text-4xl",
};

export function AvatarBadge({
  avatar,
  color,
  size = "md",
  className,
}: {
  avatar: string;
  color: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={clsx(
        "inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br shadow-inner ring-2 ring-white/20",
        gradientFor(color),
        sizes[size],
        className,
      )}
    >
      {avatar}
    </span>
  );
}
