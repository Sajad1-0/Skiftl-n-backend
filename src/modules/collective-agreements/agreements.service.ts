import { asc, eq } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { collectiveAgreements } from '../../db/schema.js';

export interface PublicAgreement {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export async function listActiveAgreements(): Promise<PublicAgreement[]> {
  return db
    .select({
      id: collectiveAgreements.id,
      code: collectiveAgreements.code,
      name: collectiveAgreements.name,
      description: collectiveAgreements.description,
    })
    .from(collectiveAgreements)
    .where(eq(collectiveAgreements.isActive, true))
    .orderBy(asc(collectiveAgreements.name));
}
