import Image from "next/image";
import Link from "next/link";

import { APP_NAME } from "@/utils/constants";
import { cn } from "@/utils/cn";

interface AppLogoProps {
  href?: string;
  compact?: boolean;
  className?: string;
}

export function AppLogo({ href = "/", compact = false, className }: AppLogoProps) {
  return (
    <Link href={href} className={cn("app-logo inline-flex items-center", className)} aria-label={APP_NAME}>
      <Image
        src="/Branding.png"
        alt={`${APP_NAME} logo`}
        width={833}
        height={217}
        className={cn("app-logo-image w-auto object-contain", compact ? "h-8" : "h-10 sm:h-11")}
        priority
      />
    </Link>
  );
}
