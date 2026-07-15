import { cn } from '@/lib/utils';

interface PageSurfaceProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: string;
  padded?: boolean;
}

export function PageSurface({
  children,
  className,
  maxWidth = 'max-w-5xl',
  padded = true,
}: PageSurfaceProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full',
        maxWidth,
        padded && 'px-4 py-6 sm:px-6 lg:px-8',
        className
      )}
    >
      {children}
    </div>
  );
}
