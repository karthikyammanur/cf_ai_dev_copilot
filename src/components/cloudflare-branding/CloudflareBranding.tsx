/**
 * Cloudflare Branding Components
 *
 * Official Cloudflare-themed UI elements for consistent branding.
 * Uses Cloudflare's orange color palette and design language.
 *
 * @module components/cloudflare-branding
 */

import {
  CloudIcon,
  ShieldCheckIcon,
  GlobeIcon,
  LightningIcon
} from "@phosphor-icons/react";

// =============================================================================
// Brand Colors (from Cloudflare Design System)
// =============================================================================

export const CF_COLORS = {
  orange: "#F6821F",
  orangeDark: "#E5720E",
  orangeLight: "#FF9A3D",
  black: "#000000",
  white: "#FFFFFF",
  gray100: "#F5F5F5",
  gray900: "#1A1A1A"
};

// =============================================================================
// Cloudflare Badge
// =============================================================================

interface CloudflareBadgeProps {
  variant?: "full" | "compact" | "icon";
  className?: string;
}

/**
 * Official "Powered by Cloudflare" badge
 */
export function CloudflareBadge({
  variant = "full",
  className = ""
}: CloudflareBadgeProps) {
  if (variant === "icon") {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        <CloudIcon size={24} weight="duotone" className="text-[#F6821F]" />
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={`inline-flex items-center gap-1.5 ${className}`}>
        <CloudIcon size={16} weight="duotone" className="text-[#F6821F]" />
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Cloudflare
        </span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 ${className}`}
    >
      <CloudIcon size={18} weight="duotone" className="text-[#F6821F]" />
      <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
        Powered by Cloudflare Workers AI
      </span>
    </div>
  );
}

// =============================================================================
// Feature Badges
// =============================================================================

type FeatureName =
  | "workers-ai"
  | "durable-objects"
  | "kv"
  | "r2"
  | "d1"
  | "security"
  | "edge";

interface FeatureBadgeProps {
  feature: FeatureName;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const FEATURE_CONFIG: Record<
  FeatureName,
  { icon: React.ReactNode; label: string; color: string }
> = {
  "workers-ai": {
    icon: <LightningIcon size={16} weight="fill" />,
    label: "Workers AI",
    color: "text-yellow-500"
  },
  "durable-objects": {
    icon: <CloudIcon size={16} weight="fill" />,
    label: "Durable Objects",
    color: "text-blue-500"
  },
  kv: {
    icon: <GlobeIcon size={16} weight="fill" />,
    label: "KV Namespace",
    color: "text-green-500"
  },
  r2: {
    icon: <CloudIcon size={16} weight="fill" />,
    label: "R2 Storage",
    color: "text-purple-500"
  },
  d1: {
    icon: <CloudIcon size={16} weight="fill" />,
    label: "D1 Database",
    color: "text-cyan-500"
  },
  security: {
    icon: <ShieldCheckIcon size={16} weight="fill" />,
    label: "Edge Security",
    color: "text-[#F6821F]"
  },
  edge: {
    icon: <GlobeIcon size={16} weight="fill" />,
    label: "Edge Network",
    color: "text-[#F6821F]"
  }
};

/**
 * Badge showing a specific Cloudflare feature
 */
export function FeatureBadge({
  feature,
  showLabel = true,
  size = "md",
  className = ""
}: FeatureBadgeProps) {
  const config = FEATURE_CONFIG[feature];

  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[10px]",
    md: "px-2 py-1 text-xs",
    lg: "px-3 py-1.5 text-sm"
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 ${sizeClasses[size]} ${className}`}
    >
      <span className={config.color}>{config.icon}</span>
      {showLabel && (
        <span className="font-medium text-neutral-600 dark:text-neutral-300">
          {config.label}
        </span>
      )}
    </span>
  );
}

// =============================================================================
// Footer Branding
// =============================================================================

interface BrandedFooterProps {
  className?: string;
  showFeatures?: boolean;
}

/**
 * Footer with Cloudflare branding and feature badges
 */
export function BrandedFooter({
  className = "",
  showFeatures = true
}: BrandedFooterProps) {
  return (
    <footer className={`flex flex-col items-center gap-3 py-4 ${className}`}>
      {showFeatures && (
        <div className="flex flex-wrap justify-center gap-2">
          <FeatureBadge feature="workers-ai" size="sm" />
          <FeatureBadge feature="durable-objects" size="sm" />
          <FeatureBadge feature="kv" size="sm" />
        </div>
      )}
      <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
        <CloudflareBadge variant="compact" />
        <span>•</span>
        <span>Llama 3.3 70B</span>
        <span>•</span>
        <a
          href="https://developers.cloudflare.com/workers-ai/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[#F6821F] transition-colors"
        >
          Docs
        </a>
      </div>
    </footer>
  );
}

// =============================================================================
// Internship Banner
// =============================================================================

/**
 * Banner for Cloudflare internship project identification
 */
export function InternshipBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-[#F6821F] to-[#E5720E] text-white text-center py-1 text-xs font-medium">
      <span className="opacity-90">
        🎓 Cloudflare Workers AI Internship Project 2025
      </span>
    </div>
  );
}
