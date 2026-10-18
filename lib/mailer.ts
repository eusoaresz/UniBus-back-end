import "dotenv/config";
import nodemailer from "nodemailer";

const smtpUser = process.env.MAILTRAP_USER ?? process.env.MAILTRAP_EMAIL;
const smtpPassword = process.env.MAILTRAP_PASS ?? process.env.MAILTRAP_SENHA;
export const mailFrom =
  process.env.SMTP_FROM ?? process.env.MAIL_FROM ?? process.env.SMTP_USER ?? smtpUser;

if (!smtpUser || !smtpPassword) {
  throw new Error(
    "As variáveis MAILTRAP_USER (ou MAILTRAP_EMAIL) e MAILTRAP_PASS (ou MAILTRAP_SENHA) não foram definidas.",
  );
}

export const transporter = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
  port: 2525,
  auth: {
    user: smtpUser,
    pass: smtpPassword,
  },
});