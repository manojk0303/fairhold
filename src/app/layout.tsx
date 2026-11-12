import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fairhold — milestone payments released on proof",
  description:
    "Fairhold holds a client's payment in PayPal, has an AI reviewer check the delivered work against criteria both sides agreed on, and releases exactly what was earned.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${schibsted.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
