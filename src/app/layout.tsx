import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { SerwistProvider } from "./serwist-provider";
import "./globals.css";
import Script from "next/script";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/providers/QueryProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const APP_NAME = "Peregrine LMS";
const APP_DEFAULT_TITLE = "Peregrine T&C | LMS";
const APP_TITLE_TEMPLATE = "%s | Peregrine LMS";
const APP_DESCRIPTION = "Advanced Learning Management System";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_DEFAULT_TITLE,
    template: APP_TITLE_TEMPLATE,
  },
  description: APP_DESCRIPTION,
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_DEFAULT_TITLE,
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: APP_DEFAULT_TITLE,
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: APP_DEFAULT_TITLE,
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script type="text/javascript" id="microsoft-clarity" strategy="afterInteractive">
          {`
          (function(c,l,a,r,i,t,y){
            c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments) };
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "w89638exzo");
          `}
        </Script>
      </head>
      <body className={inter.variable}>
        <QueryProvider>
          <SerwistProvider swUrl="/serwist/sw.js">{children}</SerwistProvider>
          <Toaster richColors position="top-right" />
        </QueryProvider>
      </body>
    </html>
  );
}
