import bcrypt from 'bcrypt';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { eq } from 'drizzle-orm';

import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { users, type User } from '../../db/schema.js';
import { AppError } from '../../middleware/error.middleware.js';
import type { LoginInput, RegisterInput } from './auth.schema.js';

interface JWTPayload {
  userId: string;
  email: string;
}

interface PublicUser {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  isPremium: boolean;
  monthlySalaryGoal: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AuthResponse {
  token: string;
  user: PublicUser;
}

const SALT_ROUNDS = 12;

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName ?? null,
    email: user.email,
    isPremium: user.isPremium,
    monthlySalaryGoal: user.monthlySalaryGoal ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN_SECONDS,
  });
}

export async function registerUser(input: RegisterInput): Promise<AuthResponse> {
  const existingUsers = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  const existingUser = existingUsers[0];

  if (existingUser) throw new AppError(409, 'E-postadressen används redan');

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const insertedUsers = await db
    .insert(users)
    .values({
      firstName: input.firstName,
      lastName: input.lastName ?? null,
      email: input.email,
      passwordHash,
      isPremium: false,
      monthlySalaryGoal: null,
    })
    .returning();

  const createdUser = insertedUsers[0];

  if (!createdUser) throw new AppError(500, 'Kunde inte skapa användaren');

  const token = signToken({
    userId: createdUser.id,
    email: createdUser.email,
  });

  return {
    token,
    user: toPublicUser(createdUser),
  };
}

export async function loginUser(input: LoginInput): Promise<AuthResponse> {
  const matchedUsers = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  const user = matchedUsers[0];

  if (!user) throw new AppError(401, 'ogiltig e-post eller lösenord');

  const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

  if (!isPasswordValid) throw new AppError(401, 'ogiltig e-post eller lösenord');

  const token = signToken({
    userId: user.id,
    email: user.email,
  });

  return {
    token,
    user: toPublicUser(user),
  };
}

export async function getCurrentUserById(userId: string): Promise<PublicUser> {
  const matchedUsers = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  const user = matchedUsers[0];

  if (!user) throw new AppError(404, 'Användaren hittades inte');

  return toPublicUser(user);
}

export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (typeof decoded !== 'object' || decoded === null) throw new AppError(401, 'Ogiltig token');

    const userId = 'userId' in decoded ? decoded.userId : undefined;
    const email = 'email' in decoded ? decoded.email : undefined;

    if (typeof userId !== 'string' || typeof email !== 'string') {
      throw new AppError(401, 'Ogiltig token');
    }

    return { userId, email };
  } catch {
    throw new AppError(401, 'Ogiltigt eller utgången token');
  }
}
