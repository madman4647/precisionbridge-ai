import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Chrome } from "@/components/Chrome";
import { COOKIE, verifySession } from "@/lib/session";

export const metadata: Metadata = {
  title: "PrecisionBridge AI — synthetic-data prototype",
  description: "Clinician-supervised decision-support and research-hypothesis prototype. SYNTHETIC DATA — NOT FOR CLINICAL USE.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await verifySession((await cookies()).get(COOKIE)?.value);
  return (
    <html lang="en">
      <body><Chrome user={user}>{children}</Chrome></body>
    </html>
  );
}
