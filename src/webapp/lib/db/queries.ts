import { db } from './drizzle';
import { users, emails, podcasts, articles } from './schema';
import { eq, sql } from 'drizzle-orm';
import type { User, NewUser } from './schema';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/session';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';


// get user from session
export async function getUser() {
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  const sessionData = await verifyToken(sessionCookie.value);
  if (
    !sessionData ||
    !sessionData.user ||
    typeof sessionData.user.id !== 'number'
  ) {
    return null;
  }

  if (new Date(sessionData.expires) < new Date()) {
    return null;
  }

  const user = await db.select().from(users).where(eq(users.id, sessionData.user.id)).limit(1);

  if (user.length === 0) {
    return null;
  }

  return user[0];
}

// Create a new user
export async function createUser(data: NewUser) {
  return await db.insert(users).values(data).returning();
}

// Get a user by email
export async function getUserByEmail(email: string) {
  return await db.select().from(users).where(eq(users.email, email)).limit(1);
}

// Get a user by ID
export async function getUserById(id: number) {
  return await db.select().from(users).where(eq(users.id, id)).limit(1);
}

// Update a user's account details
export async function updateUser(id: number, updates: Partial<User>) {
  return await db.update(users).set(updates).where(eq(users.id, id)).returning();
}

// Delete a user by ID
export async function deleteUser(id: number) {
  return await db.delete(users).where(eq(users.id, id)).returning();
}

// Stripe 

// Get a user by Stripe customer ID
export async function getUserByStripeCustomerId(stripeCustomerId: string) {
  return await db.select().from(users).where(eq(users.stripeCustomerId, stripeCustomerId)).limit(1);
}

// Update a user's Stripe details
export async function updateUserSubscription(id: number, subscriptionData: {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeProductId: string | null;
  plan: string | 'free';
}) {
  return await db.update(users).set(subscriptionData).where(eq(users.id, id)).returning();
}

// Get all users on a specific plan
export async function getUsersByPlan(plan: string) {
  return await db.select().from(users).where(eq(users.plan, plan));
}


// Get all users scheduled for delivery on a specific day
export async function getUsersByDeliveryDay(day: number) {
  return await db.select().from(users).where(eq(users.deliveryDay, day));
}

// Add new user to the newsletter
export async function addEmailToNewsletter(email: string) {
  const existingEmail = await db.select().from(emails).where(eq(emails.email, email)).limit(1);

  if (existingEmail.length > 0) {
    if (!existingEmail[0].subscribed) {
      return await db.update(emails).set({ subscribed: true }).where(eq(emails.email, email)).returning();
    }
  }

  return await db.insert(emails).values({ email, subscribed: true }).returning();
}


// Get podcasts for user by id
export async function fetchUserPodcasts(userId: number) {
  return await db.select().from(podcasts).where(eq(podcasts.user_id, userId));
}

// Update a podcast's listened status
export async function updateListened(podcastId: number) {
  return await db.update(podcasts).set({ completed: true }).where(eq(podcasts.id, podcastId)).returning();
}

// Get all articles
export async function getArticles() {
  return await db.select().from(articles);
}

// Get a single article by ID
export async function getArticle(id: number) {
  return await db.select().from(articles).where(eq(articles.id, id)).limit(1);
}

export async function getSimilarArticles(currentEmbedding: number[]) {
  // Convert the embedding array to Postgres vector literal
  const embeddingLiteral = `array[${currentEmbedding.join(",")}]`;

  const result = await db.execute(
    sql`
      SELECT
        *,
        embedding <=> ${sql.raw(embeddingLiteral)}::vector AS distance
      FROM articles
      ORDER BY distance ASC
      OFFSET 1
      LIMIT 2
    `
  );

  return result;
}

export async function getRecommendedArticles(userEmbedding: number[]) {
  const embeddingLiteral = `array[${userEmbedding.join(",")}]`;

  const result = await db.execute(
    sql`
      SELECT
        *,
        embedding <=> ${sql.raw(embeddingLiteral)}::vector AS distance
      FROM articles
      ORDER BY distance ASC
    `
  );

  return result;
}

export async function getTop3Articles() {
  const result = await db.execute(
    sql`
      SELECT *
      FROM articles
      ORDER BY score DESC
      LIMIT 3
    `
  );

  return result;
}

// Congress Bills from S3
export async function getCongressBills() {
  try {
    const s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    // Use astra bucket for congress bills
    const bucketName = '905418457861-astra-bucket';

    // List all congress bill files in S3
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: 'congress/',
    });

    const listResponse = await s3Client.send(listCommand);
    const files = listResponse.Contents || [];

    if (files.length === 0) {
      return [];
    }

    // Get the most recent file
    const mostRecentFile = files.sort((a, b) => 
      (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0)
    )[0];

    if (!mostRecentFile.Key) {
      return [];
    }

    // Fetch the content of the most recent file
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: mostRecentFile.Key,
    });

    const getResponse = await s3Client.send(getCommand);
    const content = await getResponse.Body?.transformToString();

    if (!content) {
      return [];
    }

    const bills = JSON.parse(content);
    return bills || [];

  } catch (error) {
    console.error('Error fetching congress bills from S3:', error);
    return [];
  }
}
