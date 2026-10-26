// Única função serverless da Vercel: o vercel.json manda /api/* para cá.
import { handle } from "../server/routes.js";

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
