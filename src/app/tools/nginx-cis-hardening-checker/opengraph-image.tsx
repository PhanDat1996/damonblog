import { renderToolOgImage } from "@/lib/tool-og";

export const runtime = "edge";
export const alt = "NGINX Hardening Checker — damonsec.com";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return renderToolOgImage("nginx-cis-hardening-checker");
}
