// Server component — metadata and structured data for this route.
// page.tsx stays "use client"; tool details live in src/lib/tools.ts.

import { toolJsonLd, toolMetadata } from "@/lib/tools";

export const metadata = toolMetadata("nginx-cis-hardening-checker");

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {toolJsonLd("nginx-cis-hardening-checker").map((data, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
      ))}
      {children}
    </>
  );
}
