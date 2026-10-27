// E-mail opcional (Resend). Sem RESEND_API_KEY e EMAIL_FROM, vira no-op e o app usa o
// código gerado por quem administra a família.
import { logError } from "./http.js";

export function emailEnabled() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(to: string, subject: string, text: string) {
  if (!emailEnabled()) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Resend respondeu ${response.status}`);
    return true;
  } catch (error) {
    logError(error);
    return false;
  }
}
