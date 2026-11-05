import clsx, { type ClassValue } from "clsx";

/** Small helper for conditional class names. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
