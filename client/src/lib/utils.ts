import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert relative paths to absolute URLs for frontend use
 */
export function toAbsoluteUrl(relativePath: string): string {
  if (!relativePath) return '';
  
  // If already absolute, return as is
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }
  
  // Create absolute URL using current origin
  const baseUrl = window.location.origin;
  return new URL(relativePath, baseUrl).toString();
}
