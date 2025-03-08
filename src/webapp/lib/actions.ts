'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  User,
  users,
  type NewUser,
  podcasts,
} from '@/lib/db/schema';
import { comparePasswords, hashPassword, setSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getUserByEmail, createUser, getUser, updateUser, addEmailToNewsletter, updateListened } from '@/lib/db/queries';
import {
  validatedAction,
} from '@/lib/auth/middleware';
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

// Initialize the SQS client
const sqs = new SQSClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.ACCESS_KEY!,
    secretAccessKey: process.env.SECRET_KEY!
  }
});

export async function sendToSQS(keywords: string[]) {

  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  if (keywords.length === 0) {
    return { error: 'Keywords passed to SQS incorrectly' };
  }

  const params = {
    QueueUrl: process.env.SQS_QUEUE_URL,
    MessageBody: JSON.stringify({
      "action": "e_user_topics",
      "payload": {
        "user_id": user.id,
        "user_input": keywords
      }
    })
  };

  try {
    const command = new SendMessageCommand(params);
    await sqs.send(command);

    return { success: 'Message sent successfully to SQS' };
  } catch (error) {
    return { error: 'Failed to send message to SQS' };
  }
}

async function sendVerificationEmail(email: string, userId: number) {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '1d' });
  // TODO: ADD CREDENTIAL TO SES CLIENT
  const ses = new SESClient({
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.ACCESS_KEY!,
      secretAccessKey: process.env.SECRET_KEY!
    }
  });

  const params = {
    Source: "verification@auxiomai.com",
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Subject: {
        Data: "Verify your email address",
      },
      Body: {
        Html: {
          Data: `
          <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Verify Your Email</title>
                <style>
                    body {
                        font-family: 'Inter', 'Lato', Arial, sans-serif;
                        background-color: #F8F7FD;
                        color: #333;
                        margin: 0;
                        padding: 0;
                        text-align: center;
                    }
                    .email-container {
                        max-width: 600px;
                        margin: 0 auto;
                        background-color: #FFFFFF;
                        border-radius: 8px;
                        overflow: hidden;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    }
                    .header {
                        background-color: #1F2937;
                        padding: 20px;
                    }
                    .header img {
                        max-width: 60px;
                        height: auto;
                    }
                    .header h1 {
                        color: #FFFFFF;
                        font-size: 24px;
                        margin: 10px 0 0;
                    }
                    .content {
                        padding: 20px;
                        background-color: #FBF7E7;
                    }
                    .content h2 {
                        color:rgb(0, 0, 0);
                        font-size: 22px;
                    }
                    .content p {
                        margin: 15px 0;
                        font-size: 16px;
                        line-height: 1.5;
                    }
                    .button {
                        display: inline-block;
                        padding: 10px 20px;
                        background-color:rgb(0, 0, 0);
                        color: #FFFFFF;
                        text-decoration: none;
                        font-size: 16px;
                        border-radius: 5px;
                        margin-top: 20px;
                    }
                    .footer {
                        padding: 10px;
                        font-size: 12px;
                        color: #9F9DA8;
                        background-color: #FBF7E7;
                    }
                </style>
            </head>
            <body>
                <div class="email-container">
                    <div class="header">
                        <img src="https://auxiom-email-assets.s3.us-east-1.amazonaws.com/2.png" alt="Auxiom Logo">
                        <h1>Auxiom</h1>
                    </div>
                    <div class="content">
                        <h2>Welcome to Your Auxiom!</h2>
                        <p>Thank you for signing up. Please verify your email address to complete your registration and get started with your account.</p>
                        <a href="${process.env.BASE_URL}/verify-email?token=${token}" 
                            style="display: inline-block; padding: 10px 20px; background-color: #1F2937; color: #FFFFFF; text-decoration: none; font-size: 16px; border-radius: 5px; margin-top: 20px;">
                            Verify Email
                        </a>
                    </div>
                    <div class="footer">
                        <p>If you did not sign up for this account, please ignore this email.</p>
                        <p>Copyright 2025 Auxiom, all rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
          `,
        },
      },
    },
  };

  try {
    await ses.send(new SendEmailCommand(params));
  } catch (error) {
    console.error("Error sending email:", error);
    return { error: "Failed to send verification email. Please try again later." };
  }
}

export async function verifyEmail(token: string) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
  const userId = parseInt(decoded.userId, 10);

  if (isNaN(userId)) {
    redirect('/sign-in?message=Invalid or expired verification link. Please sign in again.');
  }

  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (user.length === 0) {
    redirect('/sign-in?message=Invalid or expired verification link. Please sign in again.');
  }

  // Update the user's email_verified status
  try {
    await updateUser(userId, { verified: true });
  } catch (error) {
    redirect('/sign-in?message=Invalid or expired verification link. Please sign in again.');
  }

  await setSession(user[0]);

  if (user[0].active === false) {
    redirect('/identity');
  } else {
    redirect('/dashboard/podcasts');
  }
}


const forgotPasswordSchema = z.object({
  email: z.string().email().min(3).max(255),
});

export const forgotPassword = validatedAction(forgotPasswordSchema, async (data, formData) => {
  const { email } = data;

  const user = await getUserByEmail(email);

  if (!user || user.length === 0) {
    // Don't reveal if the email exists or not for security reasons
    return { success: "If an account with that email exists, we've sent a password reset link." };
  }

  const token = jwt.sign({ userId: user[0].id }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  const ses = new SESClient({
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.ACCESS_KEY!,
      secretAccessKey: process.env.SECRET_KEY!
    }
  });

  const params = {
    Source: "noreply@auxiomai.com",
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Subject: {
        Data: "Reset your password",
      },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Reset Your Password</title>
                <style>
                    body {
                        font-family: 'Inter', 'Lato', Arial, sans-serif;
                        background-color: #F8F7FD;
                        color: #333;
                        margin: 0;
                        padding: 0;
                        text-align: center;
                    }
                    .email-container {
                        max-width: 600px;
                        margin: 0 auto;
                        background-color: #FFFFFF;
                        border-radius: 8px;
                        overflow: hidden;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    }
                    .header {
                        background-color: #1F2937;
                        padding: 20px;
                    }
                    .header img {
                        max-width: 60px;
                        height: auto;
                    }
                    .header h1 {
                        color: #FFFFFF;
                        font-size: 24px;
                        margin: 10px 0 0;
                    }
                    .content {
                        padding: 20px;
                        background-color: #FBF7E7;
                    }
                    .content h2 {
                        color: #1F2937;
                        font-size: 22px;
                    }
                    .content p {
                        margin: 15px 0;
                        font-size: 16px;
                        line-height: 1.5;
                    }
                    .button {
                        display: inline-block;
                        padding: 10px 20px;
                        background-color: #1F2937;
                        color: #FFFFFF;
                        text-decoration: none;
                        font-size: 16px;
                        border-radius: 5px;
                        margin-top: 20px;
                    }
                    .footer {
                        padding: 10px;
                        font-size: 12px;
                        color: #9F9DA8;
                        background-color: #FBF7E7;
                    }
                </style>
            </head>
            <body>
                <div class="email-container">
                    <div class="header">
                        <img src="https://auxiom-email-assets.s3.us-east-1.amazonaws.com/2.png" alt="Auxiom Logo">
                        <h1>Auxiom</h1>
                    </div>
                    <div class="content">
                        <h2>Reset Your Password</h2>
                        <p>We received a request to reset your password. Click the button below to reset it. This link will expire in 1 hour.</p>
                        <a href="${process.env.BASE_URL}/reset-password?token=${token}" class="button">Reset Password</a>
                    </div>
                    <div class="footer">
                        <p>If you didn’t request a password reset, you can safely ignore this email.</p>
                        <p>Copyright 2025 Auxiom, all rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
          `,
        },
      },
    },
  };

  try {
    await ses.send(new SendEmailCommand(params));
    return { success: "If an account with that email exists, we've sent a password reset link." };
  } catch (error) {
    console.error("Error sending email:", error);
    return { error: "Failed to send password reset email. Please try again later." };
  }
});

// Add this new function to handle password reset
export const resetPassword = validatedAction(
  z.object({
    token: z.string(),
    newPassword: z.string().min(8).max(100),
  }),
  async (data, formData) => {
    const { token, newPassword } = data;

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };
      const userId = decoded.userId;

      const newPasswordHash = await hashPassword(newPassword);
      await updateUser(userId, { passwordHash: newPasswordHash });

      return { success: "Password has been reset successfully." };
    } catch (error) {
      console.error("Error resetting password:", error);
      return { error: "Invalid or expired token. Please try the password reset process again." };
    }
  }
);

const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8, { message: "Password must be 8 characters or longer" }).max(100),
  redirect: z.string().optional(),
  priceId: z.string().optional(),
  inviteId: z.string().optional(),
  message: z.string().optional()
});

export const signIn = validatedAction(signInSchema, async (data, formData) => {
  const { email, password, redirect: redirectUrl, priceId, inviteId, message } = data;

  const user = await getUserByEmail(email);

  if (user.length === 0) {
    return { error: 'Invalid email or password. Please try again.' };
  }

  const foundUser = user[0];

  const isPasswordValid = await comparePasswords(
    password,
    foundUser.passwordHash
  );

  if (!isPasswordValid) {
    return { error: 'Invalid email or password. Please try again.' };
  }

  // Check if the user's email is verified
  if (!foundUser.verified) {
    // Resend verification email
    await sendVerificationEmail(email, foundUser.id);
    return { error: 'Please verify your email. A new verification email has been sent.' };
  }

  await Promise.all([
    setSession(foundUser)
  ]);

  redirect(redirectUrl || '/dashboard/podcasts');
});


const signUpSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100),
});

export const signUp = validatedAction(signUpSchema, async (data) => {
  const { email, password } = data;

  // Check if user already exists
  const existingUser = await getUserByEmail(email);

  if (existingUser.length > 0) {
    return { error: 'An account with that email already exists. Please sign in.' };
  }

  const passwordHash = await hashPassword(password);

  // Create new user
  const newUser: NewUser = {
    email,
    passwordHash,
    name: '',
    deliveryDay: 0,
    keywords: [],
    role: 'Other',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripeProductId: null,
    plan: 'free',
  };

  const createdUser = await createUser(newUser);

  // Send verification email
  await sendVerificationEmail(email, createdUser[0].id);

  // Don't set session or redirect here
  return { success: true, message: "Please check your email to verify your account." };
});


export async function signOut() {
  const user = (await getUser()) as User;
  (await cookies()).delete('session');

  redirect('/');
}

export async function updatePassword(formData: { currentPassword: string; newPassword: string }) {

  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const isPasswordValid = await comparePasswords(
    formData.currentPassword,
    user.passwordHash
  );

  if (!isPasswordValid) {
    return { error: 'Current password is incorrect.' };
  }

  if (formData.currentPassword === formData.newPassword) {
    return {
      error: 'New password must be different from the current password.',
    };
  }

  const newPasswordHash = await hashPassword(formData.newPassword);
  await updateUser(user.id, { passwordHash: newPasswordHash });

  return { success: 'Password updated successfully.' };
}

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100),
});

export async function deleteAccount() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  await db.delete(users).where(eq(users.id, user.id));

  await signOut();
}

export async function updateEmail(user_input: string) {

  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  // Update the user's email in the database
  await updateUser(user.id, { email: user_input });

  return { success: true, message: 'Email updated successfully' };
}


export async function updateUserRole(designations: string[]) {

  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  // Combine selected roles into a comma-separated string
  const roleString = designations.join(',');

  // Update the user's position
  await updateUser(user.id, { role: roleString });


  return { success: true, message: 'Roles updated successfully' };
}


export async function submitInterests(user_input: string) {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  if (!user_input) {
    return { error: 'Please enter at least 5 keywords' };
  }
  // parse the keywords comma separated string into an array
  const keys = user_input.split(',').map((word) => word.trim());

  if (keys.length < 5) {
    return { error: 'Please enter at least 5 keywords' };
  }
  // Update the user's keywords in the database
  await updateUser(user.id, { keywords: keys });
  const res = await sendToSQS(keys);

  if (res.error) {
    console.log(res.error)
    return { error: "Error setting interests. Please try again later." };
  }

  return { success: true, message: 'Interests set successfully' };
}

export async function updateInterests(keywords: string[]) {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  // Update the user's keywords in the database
  await updateUser(user.id, { keywords: keywords });
  const res = await sendToSQS(keywords);

  if (res.error) {
    console.log(res.error)
    return { error: 'Interests updated successfully' };
  }

  return { success: true, message: 'Interests updated successfully' };
}


export async function submitDay(day: number) {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  // Update the user's keywords in the database
  await updateUser(user.id, { deliveryDay: day });

  return { success: true, message: 'Day updated successfully' };
}

export async function updateUserNameOccupation(formData: { name: string; occupation: string; industry: string }) {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  // Update the user's name and occupation in the database
  await updateUser(user.id, { name: formData.name, occupation: formData.occupation, industry: formData.industry });

  return { success: true, message: 'Name updated successfully' };
}

export async function getKeywords(): Promise<string[]> {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const keywords = user.keywords;

  if (Array.isArray(keywords)) {
    return keywords;
  } else {
    return [];
  }
}

export async function getDay(): Promise<number> {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  return user.deliveryDay;
}

export async function getName(): Promise<string> {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  if (user.name) {
    return user.name;
  } else {
    return '';
  }
}

export async function getDeliveryStatus(): Promise<boolean> {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }
  const now = new Date();
  const lastSunday = new Date();
  lastSunday.setDate(now.getDate() - (now.getDay() + 1));

  // if they have had a podcast delivered since sunday (sunday included) return true
  return user.delivered >= lastSunday;
}

export async function getAccountStatus(): Promise<boolean> {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  return user.active;
}

export async function setAccountStatus(status: boolean) {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }
  // verify keywords not null
  const keywords = user.keywords;
  if (Array.isArray(keywords) && keywords.length < 5 || user.name === '' || user.occupation === '') {

    return { error: 'Onboarding not complete' };
  }

  await updateUser(user.id, { active: status });

  return { success: true, message: 'Account status updated successfully' };
}

export async function addToNewsletter(formData: { email: string }) {
  const { email } = formData;
  // Add to email table
  const res = await addEmailToNewsletter(email);

  if (res.length === 0) {
    return { error: 'Email already exists in newsletter.' };
  } else {
    return { success: 'Added to newsletter successfully.' };
  }
}

export async function getCurrentPlan(): Promise<string> {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  return user.plan;
}

export async function setListened(podcastId: number) {
  
  const res = await updateListened(podcastId);

  if (res.length === 0) {
    return { error: 'Podcast not found.' };
  } else {
    return { success: 'Podcast marked as listened.' };
  }
}