import "dotenv/config";

const secret = process.env.JWT_SECRET;
if (!secret || Buffer.byteLength(secret) < 32) {
  throw new Error("JWT_SECRET deve ter pelo menos 32 bytes.");
}
export const JWT_SECRET: string = secret;
