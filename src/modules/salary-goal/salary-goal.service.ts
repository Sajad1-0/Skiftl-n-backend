import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { AppError } from '../../middleware/error.middleware.js';
import { userHasPremium } from '../../lib/premium/premium.js';

export async function getSalaryGoal(
  userId: string,
): Promise<{ monthlySalaryGoalOre: number | null }> {
  if (!(await userHasPremium(userId))) {
    return { monthlySalaryGoalOre: null };
  }

  const rows = await db
    .select({ monthlySalaryGoal: users.monthlySalaryGoal })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = rows[0];
  if (!user) throw new AppError(404, 'Användaren hittades inte');
  return { monthlySalaryGoalOre: user.monthlySalaryGoal ?? null };
}

export async function upsertSalaryGoal(
  userId: string,
  monthlySalaryGoalOre: number | null,
): Promise<{ monthlySalaryGoalOre: number | null }> {
  if (!(await userHasPremium(userId))) {
    throw new AppError(403, 'Lönemål kräver Premium');
  }

  const updated = await db
    .update(users)
    .set({ monthlySalaryGoal: monthlySalaryGoalOre })
    .where(eq(users.id, userId))
    .returning({ monthlySalaryGoal: users.monthlySalaryGoal });

  const row = updated[0];
  if (!row) throw new AppError(404, 'Användaren hittades inte');
  return { monthlySalaryGoalOre: row.monthlySalaryGoal ?? null };
}
