// src/app/layout.jsx
import "@fontsource-variable/inter";
import "@fontsource-variable/noto-sans-bengali";
import "./globals.css";

export const metadata = {
  title: { default: "Shop tools", template: "%s · Shop tools" },
  description: "Photo, document and office tools for the shop.",
  robots: { index: false, follow: false },
};

export const viewport = { themeColor: "#151a30" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
