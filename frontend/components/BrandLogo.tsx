"use client";
import { useLocale } from "@/lib/i18n";
import Image from "next/image";

const variants = {
  primary: {
    file: "soyle-logo-primary",
    width: 1200,
    height: 400,
    display: 220,
  },
  compact: {
    file: "soyle-logo-compact",
    width: 1000,
    height: 320,
    display: 160,
  },
  vertical: {
    file: "soyle-logo-vertical",
    width: 640,
    height: 760,
    display: 160,
  },
  icon: { file: "soyle-mascot", width: 640, height: 640, display: 48 },
  small: { file: "soyle-icon-small", width: 256, height: 256, display: 28 },
} as const;

type BrandLogoProps = {
  variant?: keyof typeof variants;
  width?: number;
  tone?: "dark" | "light";
  responsive?: boolean;
  decorative?: boolean;
  className?: string;
  priority?: boolean;
};

export function BrandLogo({
  variant = "primary",
  width,
  tone = "dark",
  responsive = false,
  decorative = false,
  className = "",
  priority = false,
}: BrandLogoProps) {
  const locale = useLocale();
  const asset = variants[variant];
  const displayWidth = width ?? asset.display;
  const file =
    tone === "light" && variant === "primary" ? "soyle-logo-light" : asset.file;
  if (locale === "kk-KZ" && variant !== "icon" && variant !== "small") return <span className={`soyle-local-brand ${className}`} style={{width:displayWidth}} aria-label={decorative ? undefined : "Söyle — қарым-қатынас пен жаттығу"} aria-hidden={decorative || undefined}>
    <Image src="/branding/soyle-mascot.webp" width={80} height={80} alt="" {...(priority ? {preload:true} : {})}/>
    <span>Söyle<small>ҚАРЫМ-ҚАТЫНАС ПЕН ЖАТТЫҒУ</small></span>
  </span>;
  const image = (
    <Image
      src={`/branding/${file}.webp`}
      width={asset.width}
      height={asset.height}
      alt={
        decorative
          ? ""
          : variant === "icon" || variant === "small"
            ? "Söyle"
            : "Söyle — общение и практика"
      }
      sizes={`${displayWidth}px`}
      {...(priority ? { preload: true } : {})}
    />
  );
  return (
    <span
      className={`soyle-logo soyle-logo-${variant} ${className}`}
      style={{ width: displayWidth }}
    >
      {responsive && variant === "primary" && tone === "dark" ? (
        <picture>
          <source
            media="(max-width: 650px)"
            srcSet="/branding/soyle-logo-compact.webp"
            width={1000}
            height={320}
          />
          {image}
        </picture>
      ) : (
        image
      )}
    </span>
  );
}
