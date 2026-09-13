import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const signupCoachSchema = z.object({
  fullName: z.string().min(2).max(100),
  businessName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  locale: z.enum(["ar", "en"]),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupCoachInput = z.infer<typeof signupCoachSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8).max(72),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// Digits only — the +20 country code is a fixed UI prefix, prepended
// server-side before it ever reaches Supabase (which wants E.164).
export const phoneSchema = z.object({
  phone: z.string().regex(/^\d{7,15}$/),
  locale: z.enum(["ar", "en"]),
});

export const verifyOtpSchema = z.object({
  phone: z.string().regex(/^\d{7,15}$/),
  token: z.string().length(6),
  locale: z.enum(["ar", "en"]),
});

export type PhoneInput = z.infer<typeof phoneSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
