import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, and, gt } from "drizzle-orm";
import { Resend } from "resend";
import { db, usersTable, passwordResetTokensTable } from "@workspace/db";

const router = Router();

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return new Resend(key);
}

function getAppUrl(): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  return domain ? `https://${domain}` : "http://localhost:3000";
}

// POST /api/auth/forgot-password
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email) { res.status(400).json({ error: "Email is required" }); return; }

  // Always respond the same way — never reveal whether the email exists
  res.json({ message: "If an account with that email exists, you'll receive a reset link shortly." });

  // Do the heavy work after responding
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase().trim()));

    if (!user) return;

    // Invalidate any existing tokens for this user
    await db
      .delete(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.userId, user.id));

    // Generate a secure token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.insert(passwordResetTokensTable).values({ token, userId: user.id, expiresAt });

    const resetUrl = `${getAppUrl()}/?reset_token=${token}`;

    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: "My Digital Cleaning <support@afterglow-tanningsalon.com>",
      to: user.email,
      subject: "Reset your My Digital Cleaning password",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
          <h1 style="font-size:24px;font-weight:800;color:#1a1a1a;margin-bottom:8px;">Reset your password ✨</h1>
          <p style="color:#555;margin-bottom:24px;">Click the button below to set a new password. This link expires in 1 hour.</p>
          <a href="${resetUrl}"
             style="display:inline-block;background:linear-gradient(to bottom,#ff91b0,#e0437a);color:#fff;font-weight:800;font-size:15px;text-decoration:none;padding:14px 32px;border-radius:100px;box-shadow:0 4px 16px rgba(224,67,122,0.35);">
            Reset Password
          </a>
          <p style="color:#999;font-size:12px;margin-top:24px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
    if (error) {
      console.error("[Resend] Failed to send password reset email:", JSON.stringify(error));
    } else {
      console.log("[Resend] Password reset email sent — id:", data?.id, "to:", user.email);
    }
  } catch (err) {
    console.error("[Resend] Unexpected error sending password reset email:", err);
  }
});

// POST /api/auth/reset-password
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, password } = req.body as { token?: string; password?: string };

  if (!token || !password) {
    res.status(400).json({ error: "Token and password are required" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const now = new Date();
  const [record] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.token, token),
        gt(passwordResetTokensTable.expiresAt, now)
      )
    );

  if (!record || record.usedAt) {
    res.status(400).json({ error: "This reset link is invalid or has expired." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, record.userId));

  // Mark token as used
  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: now })
    .where(eq(passwordResetTokensTable.token, token));

  res.json({ message: "Password updated successfully. You can now sign in." });
});

export default router;
