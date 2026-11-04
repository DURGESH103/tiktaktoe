import clsx from "clsx";

export function GlassCard({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("glass rounded-3xl", className)} {...rest}>
      {children}
    </div>
  );
}
