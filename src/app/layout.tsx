import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Permitayo | Business Permit Processing, Rosario, Batangas",
    template: "%s | Permitayo",
  },
  description:
    "Permitayo is the business permit application and processing system of the Municipality of Rosario, Batangas, with AI assistance and final decisions by authorized personnel.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#183f78",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
