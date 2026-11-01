import { renderToolOgImage } from "@/lib/tool-og";

export const runtime = "edge";
export const alt = "SNI Split Proxy — damonsec.com";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return renderToolOgImage("sni-split-proxy");
}
