/**
 * Time utility functions for the AI Companions Watch application
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Format a date as a human-readable "time ago" string
 */
export function timeAgo(date: Date | string | number): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;

  if (diff < MINUTE) {
    return 'just now';
  }

  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return `${minutes}m ago`;
  }

  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours}h ago`;
  }

  if (diff < WEEK) {
    const days = Math.floor(diff / DAY);
    return `${days}d ago`;
  }

  if (diff < MONTH) {
    const weeks = Math.floor(diff / WEEK);
    return `${weeks}w ago`;
  }

  if (diff < YEAR) {
    const months = Math.floor(diff / MONTH);
    return `${months}mo ago`;
  }

  const years = Math.floor(diff / YEAR);
  return `${years}y ago`;
}

/**
 * Get start of time window from now
 */
export function getWindowStart(window: '24h' | '7d' | '30d'): Date {
  const now = new Date();
  switch (window) {
    case '24h':
      return new Date(now.getTime() - DAY);
    case '7d':
      return new Date(now.getTime() - WEEK);
    case '30d':
      return new Date(now.getTime() - MONTH);
    default:
      return new Date(now.getTime() - DAY);
  }
}

/**
 * Get date bucket (YYYY-MM-DD) for a date
 */
export function getDateBucket(date: Date | string | number): string {
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * Check if a date is within a time window
 */
export function isWithinWindow(
  date: Date | string | number,
  windowMs: number
): boolean {
  const then = new Date(date).getTime();
  return Date.now() - then <= windowMs;
}

/**
 * Count items within a time window (in minutes)
 */
export function countInWindow<T extends { createdAt?: Date | string | null }>(
  items: T[],
  windowMinutes: number,
  dateField: keyof T = 'createdAt' as keyof T
): number {
  const windowMs = windowMinutes * MINUTE;
  const now = Date.now();

  return items.filter((item) => {
    const date = item[dateField];
    if (!date) return false;
    const then = new Date(date as string | Date).getTime();
    return now - then <= windowMs;
  }).length;
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string | number): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format datetime for display
 */
export function formatDateTime(date: Date | string | number): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get ISO date string
 */
export function toISOString(date: Date | string | number): string {
  return new Date(date).toISOString();
}

/**
 * Parse date safely, returning null on failure
 */
export function parseDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}
